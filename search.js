
const input = document.getElementById('find-input');
const countSpan = document.getElementById('count');

window.onload = () => input.focus();

input.addEventListener('input', () => {
    const text = input.value;
    if (text) {
        window.electronAPI.startSearch(text);
    } else {
        window.electronAPI.stopSearch();
        countSpan.innerText = '0/0';
    }
});

input.addEventListener('keydown', (e) => {
    const text = input.value;
    if (e.key === 'Enter' && text) {
        e.preventDefault();
        window.electronAPI.navigateSearch(text, !e.shiftKey);
    } else if (e.key === 'Escape') {
        window.electronAPI.closeSearchWindow();
    }
});

document.getElementById('next-btn').addEventListener('click', () => {
    const text = input.value;
    if (text) {
        window.electronAPI.navigateSearch(text, true);
    }
});
document.getElementById('prev-btn').addEventListener('click', () => {
    const text = input.value;
    if (text) {
        window.electronAPI.navigateSearch(text, false);
    }
});
document.getElementById('close-btn').addEventListener('click', () => {
    window.electronAPI.closeSearchWindow();
});

window.electronAPI.onSearchResultData((data) => {
    countSpan.innerText = `${data.active}/${data.total}`;
});

window.electronAPI.onThemeChanged((themeName) => {
    if (themeName === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
});
