const tabsList = document.getElementById('tabs-list');

let menuItems = null;
let leaveTimeout = null;
let tabQueue = [];
let activeTabId = null;
let isMenuActivated = false;

function getDomainFromUrl(urlStr) {
    try {
        const parsed = new URL(urlStr);
        let host = parsed.hostname.replace('www.', '');
        return host.charAt(0).toUpperCase() + host.slice(1);
    } catch (e) {
        return 'Web Page';
    }
}

async function createNewTab(url) {
    try {
        const tabId = 'tab_' + Date.now();
        let tabItem = {
            id: tabId,
            targetUrl: url,
            title: getDomainFromUrl(url),
            fullTitle: url
        };

        tabQueue.push(tabItem);
        await window.electronAPI.createTab({ id: tabId, url: url });
        await switchTab(tabId);
    } catch (error) { }
}

function updateTabsUI() {
    if (!tabsList) return;
    tabsList.innerHTML = '';

    tabQueue.forEach((tab) => {
        const tabContainer = document.createElement('div');
        tabContainer.className = `tab-item ${tab.id === activeTabId ? 'active' : ''}`;
        tabContainer.title = tab.fullTitle || '';
        tabContainer.onclick = () => switchTab(tab.id);

        const titleBtn = document.createElement('span');
        titleBtn.className = 'tab-title-text';
        titleBtn.innerText = tab.title;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close-btn';
        closeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"> <path d="M0,0 L10,10 M10,0 L0,10" stroke="currentColor" stroke-width="1" /> </svg>';
        closeBtn.title = "Close Tab";
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeTab(tab);
        };

        tabContainer.appendChild(titleBtn);
        tabContainer.appendChild(closeBtn);
        tabsList.appendChild(tabContainer);
    });
}

async function closeTab(targetTab) {
    if (!targetTab) return;
    const tabIdToClose = targetTab.id;
    const currentIndex = tabQueue.findIndex(t => t.id === tabIdToClose);
    if (currentIndex === -1) return;

    await window.electronAPI.closeTab({ id: tabIdToClose });
    tabQueue.splice(currentIndex, 1);

    if (activeTabId === tabIdToClose) {
        if (tabQueue.length > 0) {
            const nextActiveIndex = Math.max(0, currentIndex - 1);
            activeTabId = tabQueue[nextActiveIndex].id;
            await switchTab(activeTabId);
        } else {
            activeTabId = null;
            updateTabsUI();
        }
    } else {
        updateTabsUI();
    }
}

async function switchTab(tabId) {
    activeTabId = tabId;
    updateTabsUI();
    await window.electronAPI.switchTab({ id: tabId });
}

async function setThemeStyle(themeName) {
    if (themeName === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        await window.electronAPI.changeWindowBg({ color: '#131314' });
    } else {
        document.documentElement.removeAttribute('data-theme');
        await window.electronAPI.changeWindowBg({ color: '#f0f4f9' });
    }
    updateTabsUI();
}

function generateSubmenuHTML(submenu) {
    if (!submenu || submenu.length === 0) return '';

    return submenu.map(item => {
        if (item.visible === false) return '';

        if (item.type === 'separator') {
            return `<div class="dropdown-separator"></div>`;
        }

        const hasSubmenu = item.submenu && item.submenu.length > 0;

        let rowClass = 'dropdown-row';
        if (item.enabled === false) rowClass += ' disabled';
        if (item.checked) rowClass += ' checked';

        return `
      <div class="${rowClass}" id="${item.id || ''}" ${item.RemoveTabIndex ? '' : 'tabindex="0"'}>
        ${item.checked
                ? '<span class="radio-indicator"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
                : ''}
        ${item.label}
        ${item.accelerator ? `<span class="shortcut">${item.accelerator}</span>` : ''}
        ${hasSubmenu ? `
          <span class="arrow"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M6 3L11 8L6 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <div class="dropdown" id="${item.id}">
            ${generateSubmenuHTML(item.submenu)}
          </div>
        ` : ''}
      </div>
    `;
    }).join('');
}

async function deactivateAllMenus() {
    isMenuActivated = false;
    menuItems.forEach(item => item.classList.remove('is-active'));
    document.body.style.setProperty('--bg-opacity', '0');
    await window.electronAPI.mouseLeaveMenu();
}

function onMousenEnterMenu(item) {
    menuItems.forEach(el => el.classList.remove('is-active'));
    item.classList.add('is-active');

    const bodyStyle = document.body.style;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bodyStyle.setProperty('--bg-opacity', '1');
        });
    });
}

window.electronAPI.onTitleChanged(({ id, title }) => {
    const matchedTab = tabQueue.find(tab => tab.id === id);
    if (matchedTab && title && title.trim() !== "") {
        const cleanTitle = title.trim();
        matchedTab.fullTitle = cleanTitle;
        matchedTab.title = cleanTitle;
        updateTabsUI();
    }
});

// window.electronAPI.onUrlChanged(({ id, url }) => {
//     const matchedTab = tabQueue.find(tab => tab.id === id);
//     if (matchedTab && url) {
//         matchedTab.fullTitle = url;
//         if (matchedTab.title === 'New Tab' || matchedTab.title === 'Web Page') {
//             matchedTab.title = truncateTitle(getDomainFromUrl(url));
//         }
//         updateTabsUI();
//     }
// });

window.electronAPI.onThemeChanged(async (themeName) => {
    await setThemeStyle(themeName);
});

window.electronAPI.onNewTabCreated(async ({ id, url }) => {
    const tabItem = {
        id: id,
        targetUrl: url,
        title: getDomainFromUrl(url),
        fullTitle: url,
        timer: null
    };

    tabQueue.push(tabItem);

    await switchTab(id);
});

window.electronAPI.onSetTabBarBackground((base64Image) => {
    const bodyStyle = document.body.style;

    bodyStyle.setProperty('--bg-img', `url('${base64Image}')`);
    bodyStyle.setProperty('--bg-size', '100%');
    bodyStyle.setProperty('--bg-repeat', 'no-repeat');
    bodyStyle.setProperty('--bg-position', 'center 72px');

    bodyStyle.setProperty('--bg-blur', '3px');
    // bodyStyle.setProperty('--bg-brightness', '0.8');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bodyStyle.setProperty('--bg-opacity', '1');
        });
    });
});

window.electronAPI.onUpdateMenus(async ({ jsonReadyData, hideTitleBar, addTabJsonReadyData }) => {
    const defaultAISupplier = await window.electronAPI.getDefaultAISupplier();

    const wrapper = document.getElementById('dynamic-menus-wrapper');
    if (!wrapper) return;

    const newHTML = jsonReadyData.map(menu => {
        const hasDropdown = menu.submenu && menu.submenu.length > 0;
        return `
      <div class="menu-item" tabindex="0">
        ${menu.label}
        ${hasDropdown ? `
          <div class="dropdown" id="${menu.id || ''}">
            ${generateSubmenuHTML(menu.submenu)}
          </div>
        ` : ''}
      </div>
    `;
    }).join('');

    wrapper.innerHTML = newHTML;

    const defaltAISupplierSet = addTabJsonReadyData.length > 0;
    let defaultAISupplierLabel = defaltAISupplierSet ? '' : ' - ' + defaultAISupplier.label;
    let addBtnHtml = `<button id="add-btn" title="New Tab${defaultAISupplierLabel}"><svg width="12" height="12" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 1V15M1 8H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg></button>`;
    const addWrapper = document.getElementById('dynamic-add-menus-wrapper');

    if (defaltAISupplierSet) {
        const startHtml = `<div class="menu-item" tabindex="0">
                ${addBtnHtml}
                <div class="dropdown" id="add-btn-dropdown">`;
        const endHtml = `</div>
            </div>`
        innerHtml = generateSubmenuHTML(addTabJsonReadyData);
        addWrapper.innerHTML = startHtml + innerHtml + endHtml;
    }
    else {
        addWrapper.innerHTML = addBtnHtml;
        document.getElementById('add-btn').onclick = async () => {
            createNewTab(defaultAISupplier.landingPage);
        };
    }

    menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
        item.addEventListener('mouseenter', async () => {
            if (leaveTimeout) {
                clearTimeout(leaveTimeout);
                leaveTimeout = null;
            }

            await window.electronAPI.mouseEnterMenu();

            if (isMenuActivated) {
                onMousenEnterMenu(item);
            }
        });

        item.addEventListener('mouseleave', () => {
            if (!isMenuActivated) {
                if (leaveTimeout) clearTimeout(leaveTimeout);

                leaveTimeout = setTimeout(async () => {
                    await window.electronAPI.mouseLeaveMenu();

                    leaveTimeout = null;
                }, 150);
            }
        });

        item.addEventListener('click', async (event) => {
            const clickedRow = event.target.closest('.dropdown-row');

            if (clickedRow) {
                event.stopPropagation();

                const hasSubMenu = clickedRow.querySelector('.dropdown');
                if (hasSubMenu) {
                    return;
                }

                if (clickedRow.id) {
                    await window.electronAPI.clickMenuItem(clickedRow.id);
                }

                await deactivateAllMenus();

                return;
            }

            event.stopPropagation();

            if (item.classList.contains('is-active')) {
                await deactivateAllMenus();
            } else {
                isMenuActivated = true;

                onMousenEnterMenu(item);
            }
        });
    });

    document.querySelector('.window-title-bar').style.display = hideTitleBar ? 'none' : 'flex';

    await window.electronAPI.menusUpdated();
});

document.addEventListener('DOMContentLoaded', async () => {
    if (tabsList) {
        tabsList.addEventListener('wheel', (e) => {
            e.preventDefault();
            tabsList.scrollLeft += e.deltaY * 0.8;
        }, { passive: false });
    }

    const currentTheme = await window.electronAPI.getCurrentTheme();
    await setThemeStyle(currentTheme);

    setTimeout(async () => {
        const landingUrl = (await window.electronAPI.getDefaultAISupplier()).landingPage;
        createNewTab(landingUrl);
    }, 150);

    document.getElementById("win-min-btn").addEventListener("click", async () => await window.electronAPI.minWindow());

    const maxBtn = document.getElementById("win-max-btn");
    maxBtn.addEventListener("click", async () => {
        if (maxBtn.innerHTML.includes('path') || maxBtn.title === "Restore") {
            maxBtn.innerHTML
                = `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>
                </svg>`;
            maxBtn.title = "Maxmize";
        }
        else {
            maxBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5,2.5 L2.5,0.5 L9.5,0.5 L9.5,7.5 L7.5,7.5" fill="none" stroke="currentColor" stroke-width="1" />
                <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />
                </svg>`;
            maxBtn.title = "Restore";
        }

        await window.electronAPI.maxWindow();
    });

    document.getElementById("win-close-btn").addEventListener("click", async () => await window.electronAPI.closeWindow());

    document.addEventListener('click', async () => {
        if (isMenuActivated) {
            await deactivateAllMenus();
        }
    });
});