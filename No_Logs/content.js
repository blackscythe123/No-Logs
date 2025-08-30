console.log("[AutoLogin] Complete Smart Auto-Login Extension - Content Script Loaded");

// ===============================
// SMART AUTO-LOGIN EXTENSION
// Complete Content Script with all features
// ===============================

const LoginState = {
    IDLE: 'idle',
    ATTEMPTING: 'attempting', 
    SUCCESS: 'success',
    FAILED: 'failed',
    MANUAL_RETRY: 'manual_retry',
    URL_BLOCKED: 'url_blocked',
    ALREADY_LOGGED_IN: 'already_logged_in',
    NO_CREDENTIALS: 'no_credentials'
};

const CONFIG = {
    MAX_BLOCK_TIME: 2 * 60 * 60 * 1000, // 2 hours auto-clear
    SESSION_CHECK_DELAY: 1000,
    MAX_ATTEMPTS: 3,
    ATTEMPT_COOLDOWN: 5000,
    FORM_TIMEOUT: 15000,
    MONITOR_TIMEOUT: 30000
};

let state = {
    currentState: LoginState.IDLE,
    currentURL: window.location.href,
    lastAttemptURL: null,
    attemptCount: 0,
    maxAttempts: CONFIG.MAX_ATTEMPTS,
    lastAttemptTime: null,
    credentials: null,
    skipAutoLogin: false
};

// ===============================
// URL TRANSITION DETECTION
// ===============================

function isLoginToMainPageTransition(currentURL, lastAttemptURL) {
    if (!lastAttemptURL) return false;

    const wasOnLoginPage = lastAttemptURL.includes('/login');
    const nowOnNonLoginPage = !currentURL.includes('/login');
    const urlsAreDifferent = currentURL !== lastAttemptURL;

    if (wasOnLoginPage && nowOnNonLoginPage && urlsAreDifferent) {
        console.log(`[AutoLogin] 🎯 LOGIN-TO-MAIN transition detected!`);
        console.log(`[AutoLogin] FROM: ${lastAttemptURL}`);
        console.log(`[AutoLogin] TO: ${currentURL}`);
        return true;
    }

    return false;
}

// ===============================
// ENHANCED INITIALIZATION WITH SELF-HEALING
// ===============================

async function initializeState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['lastAttemptURL', 'lastAttemptTime'], (data) => {
            console.log("[AutoLogin] 📋 Loading persistent state:", data);

            const currentURL = window.location.href;
            const lastAttemptURL = data.lastAttemptURL || null;
            const lastAttemptTime = data.lastAttemptTime || null;
            const now = Date.now();

            // PRIORITY 1: Login-to-main page transition (STRONGEST success indicator)
            if (isLoginToMainPageTransition(currentURL, lastAttemptURL)) {
                console.log("[AutoLogin] 🔧 SELF-HEALING (LOGIN-TO-MAIN): Strong success indicator!");
                clearURLBlock("Login-to-main page transition detected");
                state.skipAutoLogin = false;
                resolve();
                return;
            }

            // PRIORITY 2: General URL difference detection
            if (lastAttemptURL && currentURL !== lastAttemptURL) {
                console.log("[AutoLogin] 🔧 SELF-HEALING (URL): Different URL detected");
                console.log(`[AutoLogin] FROM: ${lastAttemptURL}`);
                console.log(`[AutoLogin] TO: ${currentURL}`);
                clearURLBlock("URL difference detected");
                state.skipAutoLogin = false;
                resolve();
                return;
            }

            // PRIORITY 3: Time-based expiration
            if (lastAttemptTime && (now - lastAttemptTime) > CONFIG.MAX_BLOCK_TIME) {
                const hoursAgo = Math.round((now - lastAttemptTime) / (1000 * 60 * 60));
                console.log(`[AutoLogin] 🔧 SELF-HEALING (TIME): Block is ${hoursAgo} hours old`);
                clearURLBlock(`Block expired (${hoursAgo} hours old)`);
                state.skipAutoLogin = false;
                resolve();
                return;
            }

            // PRIORITY 4: Session detection (same URL case)
            if (lastAttemptURL && currentURL === lastAttemptURL) {
                console.log("[AutoLogin] 🔍 Same URL detected - checking if already logged in...");

                setTimeout(() => {
                    checkIfAlreadyLoggedIn((isLoggedIn) => {
                        if (isLoggedIn) {
                            console.log("[AutoLogin] 🔧 SELF-HEALING (SESSION): Already logged in detected");
                            clearURLBlock("Already logged in on same URL");
                            state.currentState = LoginState.ALREADY_LOGGED_IN;
                            state.skipAutoLogin = true;

                            // Show success popup
                            showPopup("✅ Already logged in - no action needed!", true, true);

                        } else {
                            console.log("[AutoLogin] 🛡️ Not logged in - maintaining URL block");
                            maintainURLBlock(lastAttemptURL, lastAttemptTime);
                            state.skipAutoLogin = true;
                        }
                        resolve();
                    });
                }, CONFIG.SESSION_CHECK_DELAY);
                return;
            }

            // No blocking needed - fresh start
            console.log("[AutoLogin] ✅ No URL blocking - ready for auto-login");
            state.lastAttemptURL = null;
            state.lastAttemptTime = null;
            state.currentState = LoginState.IDLE;
            state.skipAutoLogin = false;
            resolve();
        });
    });
}

// ===============================
// LOGGED-IN STATUS DETECTION
// ===============================

function checkIfAlreadyLoggedIn(callback) {
    console.log("[AutoLogin] 🔍 Checking login status...");

    // Comprehensive Moodle logged-in detection
    const loggedInSelectors = [
        // Standard Moodle elements
        '#user-menu', '.dashboard', '.logout', '[class*="dashboard"]',
        '[class*="profile"]', '[id*="dashboard"]', '[class*="user-menu"]',
        '.userpicture', '#page-wrapper', '.navbar-nav .dropdown',
        'a[href*="logout"]', '.block_myprofile', '.block_navigation',
        '.usermenu', '#page-header .userpicture',
        // Additional Moodle indicators
        '.page-header-headings', '.breadcrumb', '.course-content',
        '#page-my-index', '.block_timeline', '.block_calendar_upcoming',
        '.block_recentlyaccesseditems', '.block_myoverview'
    ];

    const loggedInElements = document.querySelectorAll(loggedInSelectors.join(', '));

    if (loggedInElements.length > 0) {
        console.log(`[AutoLogin] ✅ Found logged-in elements: ${loggedInElements.length}`);
        callback(true);
        return;
    }

    // Check URL and form presence
    const currentURL = window.location.href;
    const isLoginPage = currentURL.includes('/login');
    const hasLoginForm = document.querySelector('input[type="password"]');

    if (!isLoginPage && !hasLoginForm) {
        console.log("[AutoLogin] ✅ Not on login page and no login form - likely logged in");
        callback(true);
        return;
    }

    // Check page content for logged-in indicators
    const title = document.title.toLowerCase();
    const bodyText = document.body.textContent.toLowerCase();

    const loggedInKeywords = ['dashboard', 'welcome', 'profile', 'courses', 'my courses'];
    const hasLoggedInContent = loggedInKeywords.some(keyword => 
        (title.includes(keyword) || bodyText.includes(keyword)) && !title.includes('login')
    );

    if (hasLoggedInContent) {
        console.log("[AutoLogin] ✅ Found logged-in content indicators");
        callback(true);
        return;
    }

    console.log("[AutoLogin] ❌ No logged-in indicators found - user needs to login");
    callback(false);
}

// ===============================
// STATE MANAGEMENT
// ===============================

function clearURLBlock(reason) {
    console.log(`[AutoLogin] 🧹 Clearing URL block - Reason: ${reason}`);

    state.lastAttemptURL = null;
    state.lastAttemptTime = null;
    state.currentState = LoginState.IDLE;

    chrome.storage.local.remove(['lastAttemptURL', 'lastAttemptTime'], () => {
        console.log("[AutoLogin] ✅ URL block cleared from storage");
        console.log("[AutoLogin] 🔓 Auto-login re-enabled for future visits");
    });
}

function maintainURLBlock(lastAttemptURL, lastAttemptTime) {
    console.log("[AutoLogin] 🛡️ Maintaining URL block");
    console.log(`[AutoLogin] Blocked URL: ${lastAttemptURL}`);

    state.lastAttemptURL = lastAttemptURL;
    state.lastAttemptTime = lastAttemptTime;
    state.currentState = LoginState.URL_BLOCKED;

    const timeAgo = lastAttemptTime ? Math.round((Date.now() - lastAttemptTime) / (1000 * 60)) : 0;
    console.log(`[AutoLogin] Block age: ${timeAgo} minutes`);
}

function saveStateToStorage() {
    const persistentData = {
        lastAttemptURL: state.lastAttemptURL,
        lastAttemptTime: state.lastAttemptTime
    };

    chrome.storage.local.set(persistentData, () => {
        console.log("[AutoLogin] 💾 Saved state:", persistentData);
    });
}

// ===============================
// POPUP MANAGEMENT
// ===============================

function showPopup(reason, success = false, alreadyLoggedIn = false) {
    try {
        chrome.runtime.sendMessage({ 
            type: "showPopup", 
            reason: reason,
            success: success,
            alreadyLoggedIn: alreadyLoggedIn,
            currentURL: state.currentURL,
            lastAttemptURL: state.lastAttemptURL,
            urlBlocked: state.currentState === LoginState.URL_BLOCKED,
            noCredentials: state.currentState === LoginState.NO_CREDENTIALS
        });
        console.log(`[AutoLogin] 📋 Showing popup: ${reason}`);
    } catch (error) {
        console.log("[AutoLogin] Could not show popup:", error.message);
    }
}

// ===============================
// LOGIN LOGIC
// ===============================

function isAutoLoginAllowed() {
    if (state.skipAutoLogin) {
        console.log("[AutoLogin] ⏸️ Auto-login skipped by flag");
        return false;
    }

    if (state.currentState === LoginState.ALREADY_LOGGED_IN) {
        console.log("[AutoLogin] ✅ Already logged in - no need for auto-login");
        return false;
    }

    if (state.currentState === LoginState.URL_BLOCKED) {
        console.log("[AutoLogin] 🛡️ URL blocked - manual retry required");
        return false;
    }

    const currentURL = window.location.href;
    const lastAttemptURL = state.lastAttemptURL;

    if (!lastAttemptURL) {
        console.log("[AutoLogin] ✅ No previous attempt - allowed");
        return true;
    }

    if (currentURL !== lastAttemptURL) {
        console.log("[AutoLogin] ✅ Different URL - allowed");
        return true;
    }

    console.log("[AutoLogin] ❌ Same URL as failed attempt - blocked");
    return false;
}

function attemptLogin(username = "", password = "", isManualAttempt = false) {
    const currentURL = window.location.href;

    console.log(`[AutoLogin] 🚀 Login attempt - Manual: ${isManualAttempt}, URL: ${currentURL}`);

    // Validate credentials
    if (!username || !password) {
        console.log("[AutoLogin] ❌ Missing credentials");
        handleNoCredentials();
        return;
    }

    // Check if auto-login is allowed (for automatic attempts)
    if (!isManualAttempt && !isAutoLoginAllowed()) {
        console.log("[AutoLogin] 🚫 Auto-login not allowed");

        if (state.currentState === LoginState.URL_BLOCKED) {
            showPopup("Previous login attempt failed. Manual retry required.", false, false);
        }
        return;
    }

    // Additional checks
    if (!canAttemptLogin(isManualAttempt)) {
        return;
    }

    // Update state
    state.currentState = isManualAttempt ? LoginState.MANUAL_RETRY : LoginState.ATTEMPTING;
    state.attemptCount++;
    state.lastAttemptTime = Date.now();
    state.lastAttemptURL = currentURL;
    state.credentials = { username, password };

    // Save state
    saveStateToStorage();

    console.log(`[AutoLogin] 🎯 Starting login (${state.attemptCount}/${state.maxAttempts})`);

    waitForLoginForm((userField, passField, submitBtn) => {
        try {
            setInputValue(userField, username);
            setInputValue(passField, password);

            setTimeout(() => {
                submitBtn.click();
                monitorLoginResult();
                console.log("[AutoLogin] 📤 Form submitted, monitoring result...");
            }, 100);

        } catch (error) {
            console.error("[AutoLogin] ❌ Login error:", error);
            handleLoginFailure("Login attempt failed: " + error.message);
        }
    });
}

function handleNoCredentials() {
    console.log("[AutoLogin] ⚠️ No stored credentials found");

    state.currentState = LoginState.NO_CREDENTIALS;

    showPopup("No login credentials found. Please enter your username and password.", false, false);
}

function canAttemptLogin(isManualAttempt = false) {
    if (isManualAttempt) {
        console.log("[AutoLogin] ✅ Manual attempt - always allowed");
        return true;
    }

    if (state.currentState === LoginState.ATTEMPTING) {
        console.log("[AutoLogin] ❌ Already attempting login");
        return false;
    }

    if (state.lastAttemptTime && (Date.now() - state.lastAttemptTime) < CONFIG.ATTEMPT_COOLDOWN) {
        console.log("[AutoLogin] ❌ Rate limited - too soon since last attempt");
        return false;
    }

    return true;
}

// ===============================
// FORM HANDLING
// ===============================

function waitForLoginForm(callback, interval = 500, timeout = CONFIG.FORM_TIMEOUT) {
    const start = Date.now();

    const timer = setInterval(() => {
        const userField = document.querySelector(
            'input[name="username"], input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]'
        );
        const passField = document.querySelector(
            'input[name="password"], input[type="password"], input[name*="pass"]'
        );
        const submitBtn = document.querySelector(
            'button[type="submit"], input[type="submit"], button[name="loginbtn"]'
        );

        if (userField && passField && submitBtn) {
            clearInterval(timer);
            console.log("[AutoLogin] ✅ Login form elements found");
            callback(userField, passField, submitBtn);
            return;
        }

        if (Date.now() - start > timeout) {
            clearInterval(timer);
            console.log("[AutoLogin] ⏰ Login form timeout");
            handleLoginFailure("Login form elements not found within timeout");
            return;
        }
    }, interval);
}

function setInputValue(input, value) {
    input.focus();
    input.value = value;

    // Trigger events for form validation
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    input.blur();
}

// ===============================
// LOGIN MONITORING
// ===============================

function monitorLoginResult() {
    let checkCount = 0;
    const maxChecks = 30;
    const originalURL = window.location.href;

    console.log(`[AutoLogin] 👀 Monitoring login from: ${originalURL}`);

    const monitor = setInterval(() => {
        checkCount++;
        const currentURL = window.location.href;

        // SUCCESS: URL changed (especially login-to-main transition)
        if (currentURL !== originalURL) {
            console.log(`[AutoLogin] ✅ LOGIN SUCCESS - URL changed!`);
            console.log(`[AutoLogin] FROM: ${originalURL}`);
            console.log(`[AutoLogin] TO: ${currentURL}`);

            if (isLoginToMainPageTransition(currentURL, originalURL)) {
                console.log(`[AutoLogin] 🎯 Perfect! Login-to-main page transition confirmed`);
            }

            clearInterval(monitor);
            handleLoginSuccess();
            return;
        }

        // SUCCESS: Check if logged in elements appeared
        checkIfAlreadyLoggedIn((isLoggedIn) => {
            if (isLoggedIn) {
                console.log("[AutoLogin] ✅ LOGIN SUCCESS - logged in elements detected");
                clearInterval(monitor);
                handleLoginSuccess();
                return;
            }
        });

        // FAILURE: Error elements detected
        const errorElements = document.querySelectorAll(
            '.error, .alert-error, [class*="error"], [class*="invalid"], .login-error, .alert-danger, .loginfailures'
        );

        if (errorElements.length > 0) {
            console.log("[AutoLogin] ❌ LOGIN FAILED - error elements found");
            clearInterval(monitor);
            handleLoginFailure("Invalid credentials detected");
            return;
        }

        // FAILURE: Password field cleared (common failure indicator)
        if (checkCount > 8) {
            const passwordField = document.querySelector('input[type="password"]');
            if (passwordField && passwordField.value === '') {
                console.log("[AutoLogin] ❌ LOGIN FAILED - password field cleared");
                clearInterval(monitor);
                handleLoginFailure("Login failed - password field was cleared");
                return;
            }
        }

        // FAILURE: Still on same login page after reasonable time
        if (checkCount > 12 && currentURL === originalURL) {
            const passwordField = document.querySelector('input[type="password"]');
            if (passwordField) {
                console.log("[AutoLogin] ❌ LOGIN FAILED - still on login page");
                clearInterval(monitor);
                handleLoginFailure("Still on login page - credentials likely incorrect");
                return;
            }
        }

        // TIMEOUT
        if (checkCount >= maxChecks) {
            console.log("[AutoLogin] ⏰ LOGIN TIMEOUT");
            clearInterval(monitor);
            handleLoginFailure("Login monitoring timeout");
            return;
        }

        // Progress indicator
        if (checkCount % 5 === 0) {
            console.log(`[AutoLogin] Monitoring... ${checkCount}/${maxChecks}`);
        }

    }, 1000);
}

// ===============================
// RESULT HANDLING
// ===============================

function handleLoginSuccess() {
    console.log("[AutoLogin] 🎉 LOGIN SUCCESS CONFIRMED!");

    state.currentState = LoginState.SUCCESS;

    // Clear all URL blocks on success
    clearURLBlock("Login succeeded - clearing all blocks");

    try {
        chrome.runtime.sendMessage({ 
            type: "loginSuccess", 
            url: window.location.href,
            clearedBlocks: true,
            attemptCount: state.attemptCount
        });
        console.log("[AutoLogin] 📤 Notified background script of success");
    } catch (error) {
        console.log("[AutoLogin] Could not notify background script");
    }
}

function handleLoginFailure(reason = "Unknown failure") {
    console.log(`[AutoLogin] ❌ LOGIN FAILED: ${reason}`);

    state.currentState = LoginState.FAILED;

    // Keep URL block to prevent automatic retry on same page
    console.log(`[AutoLogin] 🛡️ Maintaining URL block for: ${state.lastAttemptURL}`);

    showPopup(`Login failed: ${reason}. Please check your credentials and try again.`, false, false);
}

// ===============================
// MAIN PAGE LOAD HANDLER
// ===============================

async function handlePageLoad() {
    console.log(`[AutoLogin] 📄 Page loaded: ${window.location.href}`);

    // Initialize with enhanced self-healing
    await initializeState();
    state.currentURL = window.location.href;

    // Check if auto-login should be skipped
    if (state.skipAutoLogin) {
        console.log("[AutoLogin] ⏸️ Auto-login skipped");

        if (state.currentState === LoginState.URL_BLOCKED) {
            showPopup("Previous login failed. Use popup to retry.", false, false);
        }
        return;
    }

    console.log("[AutoLogin] ✅ Auto-login allowed - starting...");

    // Small delay to ensure page is fully loaded
    setTimeout(() => {
        chrome.storage.local.get(["username", "password"], (data) => {
            if (data.username && data.password) {
                console.log("[AutoLogin] 🔑 Found credentials - attempting auto-login");
                attemptLogin(data.username, data.password, false);
            } else {
                console.log("[AutoLogin] ⚠️ No stored credentials");
                handleNoCredentials();
            }
        });
    }, 1000);
}

// ===============================
// MESSAGE HANDLING
// ===============================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`[AutoLogin] 📨 Received message: ${message.type}`);

    switch (message.type) {
        case "newCredentials":
            console.log("[AutoLogin] 🔑 Manual login requested");
            attemptLogin(message.credentials.username, message.credentials.password, true);
            sendResponse({ success: true, message: "Manual login attempt started" });
            break;

        case "getState":
            const response = { 
                state: state.currentState, 
                attemptCount: state.attemptCount,
                maxAttempts: state.maxAttempts,
                currentURL: state.currentURL,
                lastAttemptURL: state.lastAttemptURL,
                isUrlBlocked: state.currentState === LoginState.URL_BLOCKED,
                isAlreadyLoggedIn: state.currentState === LoginState.ALREADY_LOGGED_IN,
                noCredentials: state.currentState === LoginState.NO_CREDENTIALS,
                skipAutoLogin: state.skipAutoLogin,
                blockAge: state.lastAttemptTime ? Math.round((Date.now() - state.lastAttemptTime) / (1000 * 60)) : 0
            };
            console.log("[AutoLogin] 📊 Sending state:", response);
            sendResponse(response);
            break;

        case "resetURLBlock":
            console.log("[AutoLogin] 🔧 Manual URL block reset requested");
            clearURLBlock("Manual reset requested");
            state.skipAutoLogin = false;
            sendResponse({ success: true, message: "URL block reset successfully" });
            break;

        case "forceAutoLogin":
            console.log("[AutoLogin] 🚀 Force auto-login requested");
            clearURLBlock("Force auto-login requested");
            state.skipAutoLogin = false;
            handlePageLoad();
            sendResponse({ success: true, message: "Force auto-login initiated" });
            break;

        default:
            console.log("[AutoLogin] ⚠️ Unknown message type:", message.type);
            sendResponse({ success: false, error: "Unknown message type" });
    }

    return true; // Keep message channel open for async responses
});

// ===============================
// INITIALIZATION
// ===============================

// Initialize when page loads
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handlePageLoad);
} else {
    handlePageLoad();
}

// Handle SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log(`[AutoLogin] 🔄 SPA navigation detected: ${url}`);
        handlePageLoad();
    }
}).observe(document, { subtree: true, childList: true });

console.log("[AutoLogin] 🎯 Smart Auto-Login Extension - Content Script Initialized");
console.log("[AutoLogin] 🛡️ Features: URL Protection, Self-Healing, Session Detection, No-Credential Handling");