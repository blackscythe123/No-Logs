console.log("[Popup] Smart Auto-Login Extension - Popup Script with Auto-Refresh");

// ===============================
// SMART AUTO-LOGIN EXTENSION
// Final Popup Script - Auto-Refresh After Credential Updates
// ===============================

const UI_ELEMENTS = {
    saveBtn: null,
    status: null,
    usernameField: null,
    passwordField: null,
    controlsDiv: null,
    resetBtn: null,
    forceBtn: null
};

let popupState = {
    contentScriptState: null,
    isURLBlocked: false,
    isAlreadyLoggedIn: false,
    noCredentials: false,
    blockAge: 0
};

// ===============================
// INITIALIZATION
// ===============================

function initializePopup() {
    console.log("[Popup] Initializing popup interface");

    // Get UI elements
    UI_ELEMENTS.saveBtn = document.getElementById("saveBtn");
    UI_ELEMENTS.status = document.getElementById("status");
    UI_ELEMENTS.usernameField = document.getElementById("username");
    UI_ELEMENTS.passwordField = document.getElementById("password");

    // Create control buttons
    createControlButtons();

    // Load stored credentials
    loadStoredCredentials();

    // Get current state from content script
    getCurrentContentScriptState();

    // Setup event listeners
    setupEventListeners();

    console.log("[Popup] Popup interface initialized");
}

function createControlButtons() {
    // Create controls container
    UI_ELEMENTS.controlsDiv = document.createElement("div");
    UI_ELEMENTS.controlsDiv.style.cssText = `
        margin-top: 10px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    `;

    // Reset button
    UI_ELEMENTS.resetBtn = document.createElement("button");
    UI_ELEMENTS.resetBtn.textContent = "🔧 Reset Block";
    UI_ELEMENTS.resetBtn.style.cssText = `
        flex: 1;
        min-width: 90px;
        padding: 8px 6px;
        font-size: 11px;
        background: #ff9800;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
    `;
    UI_ELEMENTS.resetBtn.style.display = "none";

    // Force login button
    UI_ELEMENTS.forceBtn = document.createElement("button");
    UI_ELEMENTS.forceBtn.textContent = "🚀 Force Login";
    UI_ELEMENTS.forceBtn.style.cssText = `
        flex: 1;
        min-width: 90px;
        padding: 8px 6px;
        font-size: 11px;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
    `;
    UI_ELEMENTS.forceBtn.style.display = "none";

    UI_ELEMENTS.controlsDiv.appendChild(UI_ELEMENTS.resetBtn);
    UI_ELEMENTS.controlsDiv.appendChild(UI_ELEMENTS.forceBtn);
    UI_ELEMENTS.saveBtn.parentNode.appendChild(UI_ELEMENTS.controlsDiv);
}

function loadStoredCredentials() {
    chrome.storage.local.get(["username", "password"], (data) => {
        if (data.username && data.password) {
            UI_ELEMENTS.usernameField.value = data.username;
            UI_ELEMENTS.passwordField.value = data.password;
            updateStatus("📋 Stored credentials loaded", "info");
            console.log("[Popup] Loaded stored credentials");
        } else {
            updateStatus("⚠️ No stored credentials found", "warning");
            console.log("[Popup] No stored credentials");
        }
    });
}

// ===============================
// STATE MANAGEMENT
// ===============================

function getCurrentContentScriptState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
            updateStatus("❌ No active tab found", "error");
            return;
        }

        // Check if content script is available
        try {
            chrome.tabs.sendMessage(tabs[0].id, { type: "getState" }, (response) => {
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    console.log("[Popup] Content script communication error:", error);
                    
                    if (error.includes("receiving end does not exist")) {
                        updateStatus("❌ Extension not active on this page. Please refresh.", "error");
                    } else {
                        updateStatus("❌ Communication error. Try refreshing the page.", "error");
                    }
                    return;
                }

                if (response) {
                    console.log("[Popup] Content script state received:", response);
                    popupState.contentScriptState = response;
                    popupState.isURLBlocked = response.isUrlBlocked || false;
                    popupState.isAlreadyLoggedIn = response.isAlreadyLoggedIn || false;
                    popupState.noCredentials = response.noCredentials || false;
                    popupState.blockAge = response.blockAge || 0;

                    updateUIBasedOnState(response);
                } else {
                    updateStatus("❌ No response from content script", "error");
                }
            });
        } catch (error) {
            console.log("[Popup] Error communicating with content script:", error);
            updateStatus("❌ Error communicating with page. Please refresh.", "error");
        }
    });
}

function updateUIBasedOnState(state) {
    console.log(`[Popup] Updating UI for state: ${state.state}`);

    switch (state.state) {
        case 'no_credentials':
            updateStatus(
                "⚠️ No login credentials found\n" +
                "Please enter your username and password below\n" +
                "and click 'Save & Login'", 
                "warning"
            );
            showNoCredentialsUI();
            enableForm();
            break;

        case 'already_logged_in':
            updateStatus(
                "🎉 You are already logged in!\n" +
                "✅ Extension is working correctly\n" +
                "You can update credentials below if needed", 
                "success"
            );
            showAlreadyLoggedInUI();
            break;

        case 'url_blocked':
            const blockHours = Math.round(state.blockAge / 60);
            updateStatus(
                "🛡️ Auto-login protection active\n" +
                `Previous attempt failed ${blockHours > 0 ? blockHours + 'h ago' : 'recently'}\n` +
                "Use manual login or reset block below", 
                "warning"
            );
            showBlockedUI(state);
            enableForm();
            break;

        case 'failed':
            updateStatus(
                `❌ Login failed (${state.attemptCount} attempts)\n` +
                "Please check credentials and try again", 
                "error"
            );
            enableForm();
            break;

        case 'attempting':
            updateStatus("🔄 Login attempt in progress...", "info");
            disableForm();
            break;

        case 'success':
            updateStatus("🎉 Login successful! Closing popup...", "success");
            disableForm();
            setTimeout(() => window.close(), 2000);
            break;

        default:
            updateStatus("✅ Ready for login", "info");
            enableForm();
    }
}

// ===============================
// UI STATE HANDLERS
// ===============================

function showNoCredentialsUI() {
    hideAllSpecialUI();

    // Focus on username field
    setTimeout(() => {
        UI_ELEMENTS.usernameField.focus();
    }, 100);

    // Update button text
    UI_ELEMENTS.saveBtn.textContent = "Save & Login";

    // Create helpful info panel
    createInfoPanel(
        "noCredentialsInfo",
        "🔑 First Time Setup",
        "Enter your LMS login credentials below. " +
        "They will be securely stored for automatic login on future visits.",
        "#e3f2fd"
    );
}

function showAlreadyLoggedInUI() {
    hideAllSpecialUI();

    // Keep form ENABLED so user can edit credentials
    enableForm();

    // Update button text to reflect the action
    UI_ELEMENTS.saveBtn.textContent = "Update Credentials";

    // Create success info panel
    createInfoPanel(
        "loggedInInfo",
        "🎉 Already Logged In - Extension Working!",
        "Good news! You are already logged in and the extension is working correctly. " +
        "\n\n" +
        "💡 You can update your stored credentials below if needed. " +
        "After updating, the page will refresh to test the new credentials.",
        "#e8f5e8"
    );

    // Optional: Auto-close after longer delay (user might want to edit)
    setTimeout(() => {
        // Only auto-close if user hasn't interacted with form
        const usernameChanged = UI_ELEMENTS.usernameField.value !== UI_ELEMENTS.usernameField.defaultValue;
        const passwordChanged = UI_ELEMENTS.passwordField.value !== UI_ELEMENTS.passwordField.defaultValue;

        if (!usernameChanged && !passwordChanged) {
            updateStatus("✅ Auto-closing... (no changes made)", "info");
            setTimeout(() => window.close(), 1500);
        }
    }, 8000);
}

function showBlockedUI(state) {
    hideAllSpecialUI();

    // Show control buttons
    UI_ELEMENTS.resetBtn.style.display = "inline-block";
    UI_ELEMENTS.forceBtn.style.display = "inline-block";

    // Update button text
    UI_ELEMENTS.saveBtn.textContent = "Manual Login";

    // Create block info panel
    const blockHours = Math.round(popupState.blockAge / 60);
    const autoResetHours = Math.max(0, 2 - blockHours);

    createInfoPanel(
        "blockInfo",
        "🛡️ Protection Details",
        `URL: ${state.currentURL || 'Current page'}\n` +
        `Block Age: ${blockHours > 0 ? blockHours + ' hours' : 'Recent'}\n` +
        `Auto-Reset: ${autoResetHours > 0 ? 'In ' + autoResetHours + 'h' : 'Overdue'}\n\n` +
        "Use manual login above or reset protection below",
        "#fff3e0"
    );
}

function hideAllSpecialUI() {
    // Hide control buttons
    UI_ELEMENTS.resetBtn.style.display = "none";
    UI_ELEMENTS.forceBtn.style.display = "none";

    // Remove info panels
    const panels = document.querySelectorAll('[id$="Info"]');
    panels.forEach(panel => panel.remove());
}

function createInfoPanel(id, title, content, bgColor) {
    // Remove existing panel
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = id;
    panel.style.cssText = `
        margin-top: 12px;
        padding: 10px;
        background: ${bgColor};
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
        color: #333;
    `;

    const lines = content.split('\n');
    panel.innerHTML = `
        <strong>${title}</strong><br>
        ${lines.join('<br>')}
    `;

    UI_ELEMENTS.status.parentNode.appendChild(panel);
}

// ===============================
// STATUS UPDATES
// ===============================

function updateStatus(message, type = "info") {
    const lines = message.split('\n');
    if (lines.length > 1) {
        UI_ELEMENTS.status.innerHTML = lines.join('<br>');
    } else {
        UI_ELEMENTS.status.textContent = message;
    }

    const colors = {
        error: { color: "#d32f2f", bg: "#ffebee", border: "#f44336" },
        success: { color: "#2e7d32", bg: "#e8f5e8", border: "#4caf50" },
        warning: { color: "#ef6c00", bg: "#fff3e0", border: "#ff9800" },
        info: { color: "#1565c0", bg: "#e3f2fd", border: "#2196f3" }
    };

    const style = colors[type] || colors.info;
    UI_ELEMENTS.status.style.cssText = `
        padding: 10px;
        border-radius: 6px;
        border: 1px solid ${style.border};
        margin-top: 12px;
        font-size: 12px;
        line-height: 1.5;
        color: ${style.color};
        background-color: ${style.bg};
        font-weight: 400;
    `;

    console.log(`[Popup] Status updated (${type}): ${message.replace(/\n/g, ' ')}`);
}

// ===============================
// FORM CONTROLS
// ===============================

function enableForm() {
    UI_ELEMENTS.usernameField.disabled = false;
    UI_ELEMENTS.passwordField.disabled = false;
    UI_ELEMENTS.saveBtn.disabled = false;
    UI_ELEMENTS.resetBtn.disabled = false;
    UI_ELEMENTS.forceBtn.disabled = false;

    // Update save button text based on state
    if (popupState.noCredentials) {
        UI_ELEMENTS.saveBtn.textContent = "Save & Login";
    } else if (popupState.isAlreadyLoggedIn) {
        UI_ELEMENTS.saveBtn.textContent = "Update Credentials";
    } else {
        UI_ELEMENTS.saveBtn.textContent = "Manual Login";
    }

    // Visual feedback that form is editable
    UI_ELEMENTS.usernameField.style.backgroundColor = "#ffffff";
    UI_ELEMENTS.passwordField.style.backgroundColor = "#ffffff";
    UI_ELEMENTS.usernameField.style.cursor = "text";
    UI_ELEMENTS.passwordField.style.cursor = "text";
}

function disableForm() {
    UI_ELEMENTS.usernameField.disabled = true;
    UI_ELEMENTS.passwordField.disabled = true;
    UI_ELEMENTS.saveBtn.disabled = true;
    UI_ELEMENTS.resetBtn.disabled = true;
    UI_ELEMENTS.forceBtn.disabled = true;

    // Visual feedback that form is disabled
    UI_ELEMENTS.usernameField.style.backgroundColor = "#f5f5f5";
    UI_ELEMENTS.passwordField.style.backgroundColor = "#f5f5f5";
    UI_ELEMENTS.usernameField.style.cursor = "not-allowed";
    UI_ELEMENTS.passwordField.style.cursor = "not-allowed";
}

// ===============================
// PAGE REFRESH FUNCTION
// ===============================

function refreshCurrentPage() {
    console.log("[Popup] Refreshing current page after credential update");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.reload(tabs[0].id, () => {
                if (chrome.runtime.lastError) {
                    console.log("[Popup] Error refreshing page:", chrome.runtime.lastError.message);
                    updateStatus("⚠️ Could not refresh page automatically", "warning");
                } else {
                    console.log("[Popup] Page refresh initiated successfully");
                    updateStatus("🔄 Page refreshing to test new credentials...", "info");

                    // Close popup after refresh
                    setTimeout(() => window.close(), 1000);
                }
            });
        } else {
            console.log("[Popup] No active tab found for refresh");
            updateStatus("❌ Could not refresh page - no active tab", "error");
        }
    });
}

// ===============================
// ACTIONS - ENHANCED WITH AUTO-REFRESH
// ===============================

function performLogin() {
    const username = UI_ELEMENTS.usernameField.value.trim();
    const password = UI_ELEMENTS.passwordField.value.trim();

    // Validate credentials
    const errors = validateCredentials(username, password);
    if (errors.length > 0) {
        updateStatus(`❌ ${errors.join(', ')}`, "error");
        return;
    }

    // Different behavior based on current state
    if (popupState.isAlreadyLoggedIn) {
        updateStatus("💾 Updating stored credentials...", "info");
    } else {
        updateStatus("💾 Saving credentials and attempting login...", "info");
    }

    disableForm();
    hideAllSpecialUI();

    // Save credentials
    chrome.storage.local.set({ username, password }, () => {
        if (chrome.runtime.lastError) {
            updateStatus("❌ Error saving credentials", "error");
            enableForm();
            return;
        }

        console.log("[Popup] Credentials saved successfully");

        // ENHANCED: Different behavior for already logged in users
        if (popupState.isAlreadyLoggedIn) {
            updateStatus("✅ Credentials updated successfully!", "success");

            setTimeout(() => {
                updateStatus("🔄 Refreshing page to test new credentials...", "info");

                // KEY FEATURE: AUTO-REFRESH PAGE AFTER CREDENTIAL UPDATE
                setTimeout(() => {
                    refreshCurrentPage();
                }, 1000);

            }, 1500);

        } else {
            // Normal login attempt for other states
            sendLoginRequest(username, password);
        }
    });
}

function sendLoginRequest(username, password) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
            updateStatus("❌ No active tab found", "error");
            enableForm();
            return;
        }

        try {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: "newCredentials",
                credentials: { username, password }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    updateStatus("❌ Communication error. Please refresh the page.", "error");
                    enableForm();
                    return;
                }

                if (response && response.success) {
                    updateStatus("🚀 Login attempt started...", "info");
                    monitorLoginProgress();
                } else {
                    updateStatus("❌ Failed to start login attempt", "error");
                    enableForm();
                }
            });
        } catch (error) {
            console.log("[Popup] Error sending login request:", error);
            updateStatus("❌ Error communicating with page. Please refresh.", "error");
            enableForm();
        }
    });
}

function resetURLBlock() {
    if (!confirm("Reset URL protection?\n\nThis will clear the login failure protection and allow automatic login attempts on this page again.")) {
        return;
    }

    updateStatus("🔧 Resetting URL protection...", "info");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            try {
                chrome.tabs.sendMessage(tabs[0].id, { type: "resetURLBlock" }, (response) => {
                    if (response && response.success) {
                        updateStatus("✅ URL protection reset successfully", "success");
                        hideAllSpecialUI();
                        setTimeout(() => getCurrentContentScriptState(), 1000);
                    } else {
                        updateStatus("❌ Failed to reset URL protection", "error");
                    }
                });
            } catch (error) {
                console.log("[Popup] Error resetting URL block:", error);
                updateStatus("❌ Error communicating with page. Please refresh.", "error");
            }
        }
    });
}

function forceLogin() {
    const username = UI_ELEMENTS.usernameField.value.trim();
    const password = UI_ELEMENTS.passwordField.value.trim();

    if (!username || !password) {
        updateStatus("❌ Please enter credentials first", "error");
        UI_ELEMENTS.usernameField.focus();
        return;
    }

    updateStatus("🚀 Force login initiated...", "info");
    disableForm();

    // Save credentials first
    chrome.storage.local.set({ username, password }, () => {
        // Then force login
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                try {
                    chrome.tabs.sendMessage(tabs[0].id, { type: "forceAutoLogin" }, (response) => {
                        if (response && response.success) {
                            updateStatus("✅ Force login started", "info");
                            monitorLoginProgress();
                        } else {
                            updateStatus("❌ Force login failed", "error");
                            enableForm();
                        }
                    });
                } catch (error) {
                    console.log("[Popup] Error forcing login:", error);
                    updateStatus("❌ Error communicating with page. Please refresh.", "error");
                    enableForm();
                }
            }
        });
    });
}

// ===============================
// VALIDATION
// ===============================

function validateCredentials(username, password) {
    const errors = [];

    if (!username) {
        errors.push("Username is required");
    } else if (username.length < 2) {
        errors.push("Username must be at least 2 characters");
    }

    if (!password) {
        errors.push("Password is required");  
    } else if (password.length < 3) {
        errors.push("Password must be at least 3 characters");
    }

    return errors;
}

// ===============================
// MONITORING
// ===============================

function monitorLoginProgress() {
    let checkCount = 0;
    const maxChecks = 20;

    const monitor = setInterval(() => {
        checkCount++;

        // Get updated state
        getCurrentContentScriptState();

        if (popupState.contentScriptState) {
            const state = popupState.contentScriptState.state;

            if (state === 'success') {
                clearInterval(monitor);
                updateStatus("🎉 Login successful! Closing popup...", "success");
                setTimeout(() => window.close(), 2000);
                return;
            }

            if (state === 'failed' || state === 'url_blocked') {
                clearInterval(monitor);
                updateStatus("❌ Login failed. Please check credentials.", "error");
                enableForm();
                return;
            }
        }

        if (checkCount >= maxChecks) {
            clearInterval(monitor);
            updateStatus("⏰ Login timeout. Please try again.", "warning");
            enableForm();
            return;
        }

        // Progress indicator
        const dots = '.'.repeat((checkCount % 3) + 1);
        updateStatus(`🔄 Login in progress${dots} (${checkCount}/${maxChecks})`, "info");

    }, 1000);
}

// ===============================
// EVENT LISTENERS
// ===============================

function setupEventListeners() {
    // Main login button
    UI_ELEMENTS.saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        performLogin();
    });

    // Control buttons
    UI_ELEMENTS.resetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        resetURLBlock();
    });

    UI_ELEMENTS.forceBtn.addEventListener("click", (e) => {
        e.preventDefault();
        forceLogin();
    });

    // Keyboard navigation
    UI_ELEMENTS.usernameField.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            UI_ELEMENTS.passwordField.focus();
        }
    });

    UI_ELEMENTS.passwordField.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            performLogin();
        }
    });

    // Real-time validation feedback
    [UI_ELEMENTS.usernameField, UI_ELEMENTS.passwordField].forEach(field => {
        field.addEventListener("input", () => {
            const username = UI_ELEMENTS.usernameField.value.trim();
            const password = UI_ELEMENTS.passwordField.value.trim();
            const isValid = username.length >= 2 && password.length >= 3;

            field.style.borderColor = isValid ? "#4caf50" : "#f44336";

            // Update button state
            if (isValid) {
                UI_ELEMENTS.saveBtn.style.backgroundColor = "#4caf50";
                UI_ELEMENTS.forceBtn.style.backgroundColor = "#2196f3";
            } else {
                UI_ELEMENTS.saveBtn.style.backgroundColor = "#ccc";
                UI_ELEMENTS.forceBtn.style.backgroundColor = "#ccc";
            }
        });

        // Prevent auto-close when user is editing
        field.addEventListener("input", () => {
            // User is actively editing - don't auto-close
            field.setAttribute("data-user-editing", "true");
        });
    });
}

// ===============================
// MESSAGE HANDLING
// ===============================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Popup] Received background message:", message);

    if (message.type === "updateState" || message.alreadyLoggedIn || message.noCredentials) {
        // Refresh state when background script sends updates
        setTimeout(() => getCurrentContentScriptState(), 500);
    }

    sendResponse({ received: true });
});

// ===============================
// INITIALIZATION
// ===============================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePopup);

console.log("[Popup] Smart Auto-Login Extension - Auto-Refresh Popup Script Ready");