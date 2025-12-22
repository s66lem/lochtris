document.addEventListener('DOMContentLoaded', () => {
    const menuItems = Array.from(document.querySelectorAll('.bubble-input:not(#main_menu_btn)'));
    let currentIndex = 0;
    const isInGame = () => (typeof gScene !== 'undefined' && String(gScene).toLowerCase() === 'perform');


    function updateMenuSelection(shouldScroll = true) {
        if (isInGame()) { // do nothing while in-game; clear any visual selection
            clearMenuSelection();
            return;
        }
        
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

    document.addEventListener('mousemove', () => {
        if (currentIndex === -1) return;
        clearMenuSelection();
    }, { passive: true });

    document.addEventListener('keydown', (event) => {
        const prevIndex = currentIndex;
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
        
    });




});

