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
    MAX_BLOCK_TIME: 2 * 60 * 60 * 1000,
    SESSION_CHECK_DELAY: 1000,
    MAX_ATTEMPTS: 1,
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

// Check if current page is a login page
function isLoginPage() {
    const currentURL = window.location.href;
    return currentURL.includes('/login') || currentURL.includes('/login/index.php');
}

function isLoginToMainPageTransition(currentURL, lastAttemptURL) {
    if (!lastAttemptURL) return false;

    const wasOnLoginPage = lastAttemptURL.includes('/login');
    const nowOnNonLoginPage = !currentURL.includes('/login');
    const urlsAreDifferent = currentURL !== lastAttemptURL;

    return wasOnLoginPage && nowOnNonLoginPage && urlsAreDifferent;
}

async function initializeState() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['lastAttemptURL', 'lastAttemptTime'], (data) => {
            const currentURL = window.location.href;
            const lastAttemptURL = data.lastAttemptURL || null;
            const lastAttemptTime = data.lastAttemptTime || null;
            const now = Date.now();

            if (isLoginToMainPageTransition(currentURL, lastAttemptURL)) {
                clearURLBlock("Login-to-main page transition detected");
                state.skipAutoLogin = false;
                resolve();
                return;
            }

            if (lastAttemptURL && currentURL !== lastAttemptURL) {
                clearURLBlock("URL difference detected");
                state.skipAutoLogin = false;
                resolve();
                return;
            }

            if (lastAttemptTime && (now - lastAttemptTime) > CONFIG.MAX_BLOCK_TIME) {
                clearURLBlock("Block expired");
                state.skipAutoLogin = false;
                resolve();
                return;
            }

            if (lastAttemptURL && currentURL === lastAttemptURL) {
                setTimeout(() => {
                    checkIfAlreadyLoggedIn((isLoggedIn) => {
                        if (isLoggedIn) {
                            clearURLBlock("Already logged in on same URL");
                            state.currentState = LoginState.ALREADY_LOGGED_IN;
                            state.skipAutoLogin = true;

                            // Only show popup on login pages
                            if (isLoginPage()) {
                                showPopup("✅ Already logged in - no action needed!", true, true);
                            }
                        } else {
                            maintainURLBlock(lastAttemptURL, lastAttemptTime);
                            state.skipAutoLogin = true;
                        }
                        resolve();
                    });
                }, CONFIG.SESSION_CHECK_DELAY);
                return;
            }

            state.lastAttemptURL = null;
            state.lastAttemptTime = null;
            state.currentState = LoginState.IDLE;
            state.skipAutoLogin = false;
            resolve();
        });
    });
}

function checkIfAlreadyLoggedIn(callback) {
    const loggedInSelectors = [
        '#user-menu', '.dashboard', '.logout', '[class*="dashboard"]',
        '[class*="profile"]', '[id*="dashboard"]', '[class*="user-menu"]',
        '.userpicture', '#page-wrapper', '.navbar-nav .dropdown',
        'a[href*="logout"]', '.block_myprofile', '.block_navigation',
        '.usermenu', '#page-header .userpicture',
        '.page-header-headings', '.breadcrumb', '.course-content',
        '#page-my-index', '.block_timeline', '.block_calendar_upcoming',
        '.block_recentlyaccesseditems', '.block_myoverview'
    ];

    const loggedInElements = document.querySelectorAll(loggedInSelectors.join(', '));

    if (loggedInElements.length > 0) {
        callback(true);
        return;
    }

    const currentURL = window.location.href;
    const isLoginPage = currentURL.includes('/login');
    const hasLoginForm = document.querySelector('input[type="password"]');

    if (!isLoginPage && !hasLoginForm) {
        callback(true);
        return;
    }

    const title = document.title.toLowerCase();
    const bodyText = document.body.textContent.toLowerCase();

    const loggedInKeywords = ['dashboard', 'welcome', 'profile', 'courses', 'my courses'];
    const hasLoggedInContent = loggedInKeywords.some(keyword => 
        (title.includes(keyword) || bodyText.includes(keyword)) && !title.includes('login')
    );

    if (hasLoggedInContent) {
        callback(true);
        return;
    }

    callback(false);
}

function clearURLBlock(reason) {
    state.lastAttemptURL = null;
    state.lastAttemptTime = null;
    state.currentState = LoginState.IDLE;

    chrome.storage.local.remove(['lastAttemptURL', 'lastAttemptTime']);
}

function maintainURLBlock(lastAttemptURL, lastAttemptTime) {
    state.lastAttemptURL = lastAttemptURL;
    state.lastAttemptTime = lastAttemptTime;
    state.currentState = LoginState.URL_BLOCKED;
}

function saveStateToStorage() {
    const persistentData = {
        lastAttemptURL: state.lastAttemptURL,
        lastAttemptTime: state.lastAttemptTime
    };

    chrome.storage.local.set(persistentData);
}

function showPopup(reason, success = false, alreadyLoggedIn = false) {
    // Only show popup if we're on a login page
    if (!isLoginPage()) {
        return;
    }

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
    } catch (error) {
        // Silent error handling
    }
}

function isAutoLoginAllowed() {
    if (state.skipAutoLogin) {
        return false;
    }

    if (state.currentState === LoginState.ALREADY_LOGGED_IN) {
        return false;
    }

    if (state.currentState === LoginState.URL_BLOCKED) {
        return false;
    }

    const currentURL = window.location.href;
    const lastAttemptURL = state.lastAttemptURL;

    if (!lastAttemptURL) {
        return true;
    }

    if (currentURL !== lastAttemptURL) {
        return true;
    }

    return false;
}

function attemptLogin(username = "", password = "", isManualAttempt = false) {
    const currentURL = window.location.href;

    if (!username || !password) {
        handleNoCredentials();
        return;
    }

    if (!isManualAttempt && !isAutoLoginAllowed()) {
        if (state.currentState === LoginState.URL_BLOCKED) {
            // Only show popup on login pages
            if (isLoginPage()) {
                showPopup("Previous login attempt failed. Manual retry required.", false, false);
            }
        }
        return;
    }

    if (!canAttemptLogin(isManualAttempt)) {
        return;
    }

    state.currentState = isManualAttempt ? LoginState.MANUAL_RETRY : LoginState.ATTEMPTING;
    state.attemptCount++;
    state.lastAttemptTime = Date.now();
    state.lastAttemptURL = currentURL;
    state.credentials = { username, password };

    saveStateToStorage();

    waitForLoginForm((userField, passField, submitBtn) => {
        try {
            setInputValue(userField, username);
            setInputValue(passField, password);

            setTimeout(() => {
                submitBtn.click();
                monitorLoginResult();
            }, 100);

        } catch (error) {
            handleLoginFailure("Login attempt failed: " + error.message);
        }
    });
}

function handleNoCredentials() {
    state.currentState = LoginState.NO_CREDENTIALS;
    
    // Only show popup on login pages
    if (isLoginPage()) {
        showPopup("No login credentials found. Please enter your username and password.", false, false);
    }
}

function canAttemptLogin(isManualAttempt = false) {
    if (isManualAttempt) {
        return true;
    }

    if (state.currentState === LoginState.ATTEMPTING) {
        return false;
    }

    if (state.lastAttemptTime && (Date.now() - state.lastAttemptTime) < CONFIG.ATTEMPT_COOLDOWN) {
        return false;
    }

    return true;
}

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
            callback(userField, passField, submitBtn);
            return;
        }

        if (Date.now() - start > timeout) {
            clearInterval(timer);
            handleLoginFailure("Login form elements not found within timeout");
            return;
        }
    }, interval);
}

function setInputValue(input, value) {
    input.focus();
    input.value = value;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    input.blur();
}

function monitorLoginResult() {
    let checkCount = 0;
    const maxChecks = 30;
    const originalURL = window.location.href;

    const monitor = setInterval(() => {
        checkCount++;
        const currentURL = window.location.href;

        if (currentURL !== originalURL) {
            clearInterval(monitor);
            handleLoginSuccess();
            return;
        }

        checkIfAlreadyLoggedIn((isLoggedIn) => {
            if (isLoggedIn) {
                clearInterval(monitor);
                handleLoginSuccess();
                return;
            }
        });

        const errorElements = document.querySelectorAll(
            '.error, .alert-error, [class*="error"], [class*="invalid"], .login-error, .alert-danger, .loginfailures'
        );

        if (errorElements.length > 0) {
            clearInterval(monitor);
            handleLoginFailure("Invalid credentials detected");
            return;
        }

        if (checkCount > 8) {
            const passwordField = document.querySelector('input[type="password"]');
            if (passwordField && passwordField.value === '') {
                clearInterval(monitor);
                handleLoginFailure("Login failed - password field was cleared");
                return;
            }
        }

        if (checkCount > 12 && currentURL === originalURL) {
            const passwordField = document.querySelector('input[type="password"]');
            if (passwordField) {
                clearInterval(monitor);
                handleLoginFailure("Still on login page - credentials likely incorrect");
                return;
            }
        }

        if (checkCount >= maxChecks) {
            clearInterval(monitor);
            handleLoginFailure("Login monitoring timeout");
            return;
        }

    }, 1000);
}

function handleLoginSuccess() {
    state.currentState = LoginState.SUCCESS;
    clearURLBlock("Login succeeded - clearing all blocks");

    try {
        chrome.runtime.sendMessage({ 
            type: "loginSuccess", 
            url: window.location.href,
            clearedBlocks: true,
            attemptCount: state.attemptCount
        });
    } catch (error) {
        // Silent error handling
    }
}

function handleLoginFailure(reason = "Unknown failure") {
    state.currentState = LoginState.FAILED;
    
    // Only show popup on login pages
    if (isLoginPage()) {
        showPopup(`Login failed: ${reason}. Please check your credentials and try again.`, false, false);
    }
}

async function handlePageLoad() {
    // Only run auto-login logic on login pages
    if (!isLoginPage()) {
        return;
    }

    await initializeState();
    state.currentURL = window.location.href;

    if (state.skipAutoLogin) {
        if (state.currentState === LoginState.URL_BLOCKED && isLoginPage()) {
            showPopup("Previous login failed. Use popup to retry.", false, false);
        }
        return;
    }

    setTimeout(() => {
        chrome.storage.local.get(["username", "password"], (data) => {
            if (data.username && data.password) {
                attemptLogin(data.username, data.password, false);
            } else {
                handleNoCredentials();
            }
        });
    }, 1000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "newCredentials":
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
            sendResponse(response);
            break;

        case "resetURLBlock":
            clearURLBlock("Manual reset requested");
            state.skipAutoLogin = false;
            sendResponse({ success: true, message: "URL block reset successfully" });
            break;

        case "forceAutoLogin":
            clearURLBlock("Force auto-login requested");
            state.skipAutoLogin = false;
            handlePageLoad();
            sendResponse({ success: true, message: "Force auto-login initiated" });
            break;

        default:
            sendResponse({ success: false, error: "Unknown message type" });
    }

    return true;
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handlePageLoad);
} else {
    handlePageLoad();
}

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        handlePageLoad();
    }
}).observe(document, { subtree: true, childList: true });