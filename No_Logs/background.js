
// ===============================
// SMART AUTO-LOGIN EXTENSION
// Complete Background Script
// ===============================

const backgroundState = {
    loginAttempts: new Map(), // tabId -> attempt info
    popupRequests: new Set(), // track popup requests
    extensionStartTime: Date.now()
};

// ===============================
// MESSAGE HANDLING
// ===============================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    try {
        switch (message.type) {
            case "showPopup":
                handleShowPopupRequest(message, sender);
                sendResponse({ success: true });
                break;

            case "loginSuccess":
                handleLoginSuccess(message, sender);
                sendResponse({ success: true });
                break;

            case "loginFailed":
                handleLoginFailure(message, sender);
                sendResponse({ success: true });
                break;

            case "getBackgroundState":
                const state = {
                    state: backgroundState,
                    tabAttempts: sender.tab ? backgroundState.loginAttempts.get(sender.tab.id) : null,
                    uptime: Math.round((Date.now() - backgroundState.extensionStartTime) / 1000)
                };
                sendResponse(state);
                break;

            case "clearTabData":
                if (sender.tab) {
                    backgroundState.loginAttempts.delete(sender.tab.id);
                }
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ success: false, error: "Unknown message type" });
        }
    } catch (error) {
        // console.error("[Background] Error handling message:", error);
        sendResponse({ success: false, error: error.message });
    }

    return true; // Keep message channel open for async responses
});

// ===============================
// POPUP MANAGEMENT
// ===============================

function handleShowPopupRequest(message, sender) {
    if (!sender.tab) {
        return;
    }

    const tabId = sender.tab.id;
    const requestKey = `${tabId}_${Date.now()}`;

    // Avoid duplicate popup requests within 3 seconds
    const recentRequests = Array.from(backgroundState.popupRequests)
        .filter(key => key.startsWith(`${tabId}_`))
        .filter(key => Date.now() - parseInt(key.split('_')[1]) < 3000);

    if (recentRequests.length > 0) {
        return;
    }

    backgroundState.popupRequests.add(requestKey);

    // Clean up old requests
    setTimeout(() => {
        backgroundState.popupRequests.delete(requestKey);
    }, 10000);

    // Update attempt tracking
    const attemptInfo = backgroundState.loginAttempts.get(tabId) || {
        count: 0,
        lastAttempt: null,
        failures: [],
        url: sender.tab.url
    };

    if (message.reason) {
        attemptInfo.failures.push({
            timestamp: Date.now(),
            reason: message.reason,
            url: sender.tab.url
        });
    }

    backgroundState.loginAttempts.set(tabId, attemptInfo);


    // Show appropriate badge and notification
    if (message.success) {
        setBadgeSuccess(tabId);
    } else if (message.alreadyLoggedIn) {
        setBadgeInfo(tabId);
    } else if (message.noCredentials) {
        setBadgeWarning(tabId);
    } else {
        setBadgeError(tabId);
    }

    // Try to open popup automatically
    try {
        chrome.action.openPopup().catch(error => {

            // Fallback: Show notification
            if (chrome.notifications) {
                showFallbackNotification(message.reason || 'Click extension icon for login options');
            }
        });
    } catch (error) {
        if (chrome.notifications) {
            showFallbackNotification(message.reason || 'Click extension icon for login options');
        }
    }
}

function showFallbackNotification(message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Smart Auto-Login',
        message: message,
        priority: 1
    });
}

// ===============================
// LOGIN RESULT HANDLING
// ===============================

function handleLoginSuccess(message, sender) {
    if (!sender.tab) return;

    const tabId = sender.tab.id;


    // Update tracking
    const attemptInfo = backgroundState.loginAttempts.get(tabId) || { 
        count: 0, 
        lastAttempt: null, 
        failures: [] 
    };

    attemptInfo.lastSuccess = Date.now();
    attemptInfo.successUrl = message.url || sender.tab.url;
    attemptInfo.clearedBlocks = message.clearedBlocks || false;

    backgroundState.loginAttempts.set(tabId, attemptInfo);

    // Set success badge
    setBadgeSuccess(tabId);

    // Clear error indicators after delay
    setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
    }, 5000);

}

function handleLoginFailure(message, sender) {
    if (!sender.tab) return;

    const tabId = sender.tab.id;


    // Update tracking
    const attemptInfo = backgroundState.loginAttempts.get(tabId) || { 
        count: 0, 
        lastAttempt: null, 
        failures: [] 
    };

    attemptInfo.count = message.attemptCount || attemptInfo.count + 1;
    attemptInfo.lastAttempt = Date.now();
    attemptInfo.lastFailure = {
        timestamp: Date.now(),
        reason: message.reason,
        url: sender.tab.url
    };

    backgroundState.loginAttempts.set(tabId, attemptInfo);

    // Set error badge
    setBadgeError(tabId, attemptInfo.count);

}

// ===============================
// BADGE MANAGEMENT
// ===============================

function setBadgeSuccess(tabId) {
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#4caf50" });
}

function setBadgeError(tabId, count = null) {
    const text = count ? count.toString() : "!";
    chrome.action.setBadgeText({ text: text });
    chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
}

function setBadgeWarning(tabId) {
    chrome.action.setBadgeText({ text: "?" });
    chrome.action.setBadgeBackgroundColor({ color: "#ff9800" });
}

function setBadgeInfo(tabId) {
    chrome.action.setBadgeText({ text: "i" });
    chrome.action.setBadgeBackgroundColor({ color: "#2196f3" });
}

function clearBadge() {
    chrome.action.setBadgeText({ text: "" });
}

// ===============================
// TAB MANAGEMENT
// ===============================

// Clean up data when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    backgroundState.loginAttempts.delete(tabId);

    // Clean up popup requests for this tab
    const toRemove = Array.from(backgroundState.popupRequests)
        .filter(key => key.startsWith(`${tabId}_`));
    toRemove.forEach(key => backgroundState.popupRequests.delete(key));

});

// Clear badge when switching tabs (optional)
chrome.tabs.onActivated.addListener((activeInfo) => {
    // Optional: Clear badge when switching tabs
    // clearBadge();
});

// ===============================
// EXTENSION LIFECYCLE
// ===============================

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {

    // Clear any old state
    backgroundState.loginAttempts.clear();
    backgroundState.popupRequests.clear();
    backgroundState.extensionStartTime = Date.now();

    // Clear badges
    clearBadge();

});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {

    if (details.reason === "install") {

        // Set default storage values if needed
        chrome.storage.local.get(["username", "password"], (data) => {
            if (!data.username && !data.password) {
            } else {
            }
        });

        // Show welcome notification
        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Smart Auto-Login Installed',
                message: 'Navigate to login pages to use enhanced auto-login protection!'
            });
        }

    } else if (details.reason === "update") {
        const manifest = chrome.runtime.getManifest();

        // Clear any cached state from old version
        backgroundState.loginAttempts.clear();
        backgroundState.popupRequests.clear();
        backgroundState.extensionStartTime = Date.now();

        // Show update notification
        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Smart Auto-Login Updated',
                message: `Updated to v${manifest.version} with enhanced features!`
            });
        }
    }
});

// ===============================
// MAINTENANCE & CLEANUP
// ===============================

// Periodic cleanup of old data
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up old attempt data
    for (const [tabId, attemptInfo] of backgroundState.loginAttempts.entries()) {
        const lastActivity = Math.max(
            attemptInfo.lastAttempt || 0,
            attemptInfo.lastSuccess || 0,
            ...attemptInfo.failures.map(f => f.timestamp)
        );

        if (now - lastActivity > maxAge) {
            backgroundState.loginAttempts.delete(tabId);
        }
    }

    // Clean up old popup requests
    const oldRequests = Array.from(backgroundState.popupRequests)
        .filter(requestKey => {
            const timestamp = parseInt(requestKey.split('_')[1]);
            return now - timestamp > 300000; // 5 minutes
        });

    oldRequests.forEach(key => backgroundState.popupRequests.delete(key));

    if (oldRequests.length > 0) {
    }

}, 300000); // Run every 5 minutes

// ===============================
// ERROR HANDLING
// ===============================

// Handle unhandled errors
self.addEventListener('error', (event) => {
    // console.error("[Background] Unhandled error:", event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    // console.error("[Background] Unhandled promise rejection:", event.reason);
});

// ===============================
// INITIALIZATION COMPLETE
// ===============================


// Initial state setup
backgroundState.extensionStartTime = Date.now();
clearBadge();