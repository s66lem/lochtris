document.addEventListener('DOMContentLoaded', () => {
    const menuItems = Array.from(document.querySelectorAll('.bubble-input:not(#main_menu_btn)'));
    let currentIndex = 0;
    let listenersActive = false;

    let loggingEnabled = false;

    function slog(s) { // log for debugging
        if (loggingEnabled) {
            console.log(`[Menu] ${s}`);
        }
    }

    function updateMenuSelection(shouldScroll = true) {
        slog(`Updating menu selection to index ${currentIndex}`);
        if (!menuItems.length) return;
        // clamp index in case it's out of range
        if (currentIndex < 0) return;
        currentIndex = Math.max(0, Math.min(currentIndex, menuItems.length - 1));

        const topResetIndex = 5; 
        menuItems.forEach((btn, idx) => {
            const bubble = btn.closest('.bubble.v2') || btn.closest('.bubble') || btn;
            const isSelected = idx === currentIndex;
            if (bubble) {
                bubble.classList.toggle('selected', isSelected);

                // scroll the selected bubble into view only when requested
                if (isSelected && shouldScroll) {
                    try {
                        // if the selected index is at or above the reset threshold, scroll all the way up
                        if (idx <= topResetIndex) {
                            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                        } else {
                            const r = bubble.getBoundingClientRect();
                            const viewH = window.innerHeight || document.documentElement.clientHeight;

                            // add extra margin so the element isn't flush against the viewport edges
                            const margin = 48; // px — tweak this value to scroll further or less

                            const needsVert = r.top < margin || r.bottom > (viewH - margin);

                            if (needsVert) {
                                // compute document coordinates target (so we can include margin)
                                const targetY = window.scrollY + r.top - margin;

                                window.scrollTo({
                                    top: Math.max(0, targetY),
                                    behavior: 'smooth'
                                });
                            }
                        }
                    } catch (e) {
                        // ignore scrolling errors
                    }
                }
            }
        });
    }

    updateMenuSelection();

    function clearMenuSelection() {
        
        menuItems.forEach((btn) => {
            const bubble = btn.closest('.bubble.v2') || btn.closest('.bubble') || btn;
            bubble.classList.remove('selected');
        });
        currentIndex = -1;
    }

    // define listeners ONE SINGULAR TIME at module scope
    const mousemoveListener = () => {
        if (currentIndex === -1) return;
        clearMenuSelection();
    };

    const keydownListener = (event) => {
        const key = event.key.toLowerCase();
        if (![DEFAULT_KEY_MENUUP, DEFAULT_KEY_MENUDOWN, DEFAULT_KEY_MENUSELECT].includes(key)) {
            return;
        }

        switch (event.key.toLowerCase()) {
            case DEFAULT_KEY_MENULEFT:
                break;
            case DEFAULT_KEY_MENURIGHT:
                // Move menu selection right
                break;

            case DEFAULT_KEY_MENUDOWN:
                if (currentIndex === -1) currentIndex = 0;
                if (currentIndex < menuItems.length - 1) {
                    currentIndex += 1;
                    updateMenuSelection();
                }
                break;

            case DEFAULT_KEY_MENUUP:
                if (currentIndex === -1) currentIndex = 0;
                if (currentIndex > 0) {
                    currentIndex -= 1;
                    updateMenuSelection();
                }
                break;

            case DEFAULT_KEY_MENUSELECT:
                if (currentIndex === -1) currentIndex = 0;
                if (currentIndex >= 0 && currentIndex < menuItems.length) {
                    const btn = menuItems[currentIndex];
                    if (btn && typeof btn.click === 'function') {
                        btn.click();
                        event.preventDefault();
                    }
                }
                break;
            case DEFAULT_KEY_MENUBACK:
                // Go back in menu
                break;
        }
    };

    function enableMenuListeners() {
        if (listenersActive) return; // prevent double-adding
        
        document.addEventListener('mousemove', mousemoveListener, { passive: true });
        document.addEventListener('keydown', keydownListener);
        listenersActive = true;
        updateMenuSelection();
    }

    function disableMenuListeners() {
        if (!listenersActive) return; // nothing to remove
        
        document.removeEventListener('keydown', keydownListener);
        document.removeEventListener('mousemove', mousemoveListener);
        listenersActive = false;
        clearMenuSelection();
    }

    // global function to be called from ttt.js when scene changes
    window.updateMenuState = function() {
        
        if (typeof gScene === 'undefined') {
            disableMenuListeners();
            return;
        }
        
        const scene = String(gScene).toLowerCase();
        if (scene === 'select_section') {
            enableMenuListeners();
        } else {
            disableMenuListeners();
        }
    };

    // initial setup
    window.updateMenuState();
});