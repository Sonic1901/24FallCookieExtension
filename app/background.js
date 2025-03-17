chrome.cookies.onChanged.addListener((changeInfo) => {
    console.log('Cookie changed:', changeInfo);
});
