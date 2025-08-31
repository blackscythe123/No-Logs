const backgroundState = {
    loginAttempts: new Map(),
    popupRequests: new Set(),
    extensionStartTime: Date.now()
};

// Check if URL is a login page
function isLoginPage(url) {
    return url.includes('/login') || url.includes('/login/index.php');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        switch (message.type) {
            case "showPopup":
                // Only handle popup requests for login pages
                if (sender.tab && isLoginPage(sender.tab.url)) {
                    handleShowPopupRequest(message, sender);
                }
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
        sendResponse({ success: false, error: error.message });
    }

    return true;
});

function handleShowPopupRequest(message, sender) {
    if (!sender.tab) {
        return;
    }

    // Double-check that we're only showing popups for login pages
    if (!isLoginPage(sender.tab.url)) {
        return;
    }

    const tabId = sender.tab.id;
    const requestKey = `${tabId}_${Date.now()}`;

    const recentRequests = Array.from(backgroundState.popupRequests)
        .filter(key => key.startsWith(`${tabId}_`))
        .filter(key => Date.now() - parseInt(key.split('_')[1]) < 3000);

    if (recentRequests.length > 0) {
        return;
    }

    backgroundState.popupRequests.add(requestKey);

    setTimeout(() => {
        backgroundState.popupRequests.delete(requestKey);
    }, 10000);

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

    if (message.success) {
        setBadgeSuccess(tabId);
    } else if (message.alreadyLoggedIn) {
        setBadgeInfo(tabId);
    } else if (message.noCredentials) {
        setBadgeWarning(tabId);
    } else {
        setBadgeError(tabId);
    }

    try {
        chrome.action.openPopup().catch(error => {
            if (chrome.notifications && isLoginPage(sender.tab.url)) {
                showFallbackNotification(message.reason || 'Click extension icon for login options');
            }
        });
    } catch (error) {
        if (chrome.notifications && isLoginPage(sender.tab.url)) {
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

function handleLoginSuccess(message, sender) {
    if (!sender.tab) return;

    const tabId = sender.tab.id;

    const attemptInfo = backgroundState.loginAttempts.get(tabId) || { 
        count: 0, 
        lastAttempt: null, 
        failures: [] 
    };

    attemptInfo.lastSuccess = Date.now();
    attemptInfo.successUrl = message.url || sender.tab.url;
    attemptInfo.clearedBlocks = message.clearedBlocks || false;

    backgroundState.loginAttempts.set(tabId, attemptInfo);

    setBadgeSuccess(tabId);

    setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
    }, 5000);
}

function handleLoginFailure(message, sender) {
    if (!sender.tab) return;

    const tabId = sender.tab.id;

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

    setBadgeError(tabId, attemptInfo.count);
}

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

chrome.tabs.onRemoved.addListener((tabId) => {
    backgroundState.loginAttempts.delete(tabId);

    const toRemove = Array.from(backgroundState.popupRequests)
        .filter(key => key.startsWith(`${tabId}_`));
    toRemove.forEach(key => backgroundState.popupRequests.delete(key));
});

chrome.runtime.onStartup.addListener(() => {
    backgroundState.loginAttempts.clear();
    backgroundState.popupRequests.clear();
    backgroundState.extensionStartTime = Date.now();
    clearBadge();
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.storage.local.get(["username", "password"], (data) => {
            if (!data.username && !data.password) {
            }
        });

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

        backgroundState.loginAttempts.clear();
        backgroundState.popupRequests.clear();
        backgroundState.extensionStartTime = Date.now();

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

setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;

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

    const oldRequests = Array.from(backgroundState.popupRequests)
        .filter(requestKey => {
            const timestamp = parseInt(requestKey.split('_')[1]);
            return now - timestamp > 300000;
        });

    oldRequests.forEach(key => backgroundState.popupRequests.delete(key));

}, 300000);

self.addEventListener('error', (event) => {
    // Silent error handling
});

self.addEventListener('unhandledrejection', (event) => {
    // Silent error handling
});

backgroundState.extensionStartTime = Date.now();
clearBadge();