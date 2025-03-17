let currentFilter = "all";
let currentSort = { column: null, direction: 1 };

document.addEventListener("DOMContentLoaded", () => {
    const tableHeaders = document.querySelectorAll("#table-headers th");
    const tableBody = document.querySelector("#cookie-table tbody");
    const deleteButton = document.getElementById("delete-selected");

    deleteButton.addEventListener("click", deleteSelectedCookies);

    tableHeaders.forEach((header, index) => {
        header.addEventListener("click", () => {
            sortTableByColumn(index);
        });
    });

    chrome.cookies.getAll({}, (cookies) => {
        calculateInsights(cookies);
        updateCookieTable(cookies);
        generateDomainBarGraph(cookies);
        generateExpirationHistogram(cookies);
    });

    function calculateInsights(cookies) {
        const totalCookies = cookies.length;
        const essential = cookies.filter((cookie) => getCookieType(cookie) === "essential").length;
        const thirdParty = totalCookies - essential;

        document.getElementById("cookie-count").textContent = totalCookies;
        document.getElementById("essential-count").textContent = essential;
        document.getElementById("third-party-count").textContent = thirdParty;
    }

    function updateCookieTable(cookies) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;
            const activeDomain = new URL(tabs[0].url).hostname;
            tableBody.innerHTML = ""; // Clear existing rows
            cookies.forEach((cookie) => {
                console.log(cookie);
                const row = tableBody.insertRow();
                row.setAttribute("data-name", cookie.name);
                row.setAttribute("data-domain", cookie.domain);
                cleanDomain = cookie.domain;
                if(cookie.domain.startsWith(".")) cleanDomain = cookie.domain.slice(1);
                row.innerHTML = `
                <td><input type="checkbox" class="cookie-checkbox" data-cookie-name="${cookie.name}" data-cookie-domain="${cookie.domain}" /></td>
                <td>${cookie.name}</td>
                <td>${cookie.domain}</td>
                <td>${getCookieType(cookie)}</td>
                <td>${formatAccessTime(cookie)}</td>
                <td>${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toLocaleDateString() : "Session"}</td>
            `;
            if(activeDomain === cleanDomain || cookie.domain.endsWith(`.${activeDomain.slice(4)}`)) {
                row.style.backgroundColor = "yellow";
            }
            if(!cookie.secure || !cookie.httpOnly) {
                if(row.style.backgroundColor === "yellow"){
                    row.style.backgroundColor = "orange";
                }
                else{
                    row.style.backgroundColor = "pink";
                } 
            }
            });
        });
    }
    const creationTimes = {};

    chrome.cookies.onChanged.addListener((changeInfo) => {
        if (changeInfo.cause === "explicit" && changeInfo.cookie) {
            const timestamp = Date.now(); 
            const cookieKey = `${changeInfo.cookie.domain}:${changeInfo.cookie.name}`;
            creationTimes[cookieKey] = timestamp;
        }
    });

    chrome.webRequest.onCompleted.addListener(
        (details) => {
            const url = new URL(details.url);
            const domain = url.hostname;
    
            chrome.cookies.getAll({ domain }, (cookies) => {
                cookies.forEach((cookie) => {
                    const cookieKey = `${cookie.domain}:${cookie.name}`;
                    creationTimes[cookieKey] = Date.now();
                });
            });
        },
        { urls: ["<all_urls>"] } 
    );


    chrome.cookies.getAll({}, (cookies) => {
        cookies.forEach((cookie) => {
            const cookieKey = `${cookie.domain}:${cookie.name}`;
            if (cookie.creationDate) {
                creationTimes[cookieKey] = cookie.creationDate * 1000;
            } else {
                creationTimes[cookieKey] = Date.now();
            }
        });
        populateCookieTable(cookies);
    });

    chrome.cookies.onChanged.addListener((changeInfo) => {
        const cookie = changeInfo.cookie;
        const cookieKey = `${cookie.domain}:${cookie.name}`;
        creationTimes[cookieKey] = Date.now();
    });

    function formatAccessTime(cookie) {
        const cookieKey = `${cookie.domain}:${cookie.name}`;
        const timestamp = creationTimes[cookieKey];
        if (!timestamp) return "Unknown";

        const date = new Date(timestamp);
        return date.toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        });
    }

    function populateCookieTable(cookies) {
        const tbody = document.querySelector("#cookie-table tbody");
        tbody.innerHTML = "";

        cookies.forEach((cookie) => {
            const row = document.createElement("tr");
            row.innerHTML = `
            <td><input type="checkbox" data-cookie="${cookie.name}"></td>
            <td>${cookie.name}</td>
            <td>${cookie.domain}</td>
            <td>${cookie.sameSite === "no_restriction" ? "Third-Party" : "Essential"}</td>
            <td>${formatAccessTime(cookie)}</td>
            <td>${cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : "Session"}</td>
        `;
            tbody.appendChild(row);
        });

        calculateInsights(cookies);
    }

    function getCookieType(cookie) {
        return cookie.domain.startsWith(".") ? "third-party" : "essential";
    }

    function daysUntilExpiration(expirationDate) {
        return Math.ceil((expirationDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
    }

    document.getElementById("apply-filters").addEventListener("click", () => {
        const nameFilter = document.getElementById("filter-name").value.toLowerCase();
        const domainFilter = document.getElementById("filter-domain").value.toLowerCase();
        const typeFilter = document.getElementById("filter-type").value;
        const expirationFilter = parseInt(document.getElementById("filter-expiration").value);
        currentFilter = typeFilter;

        chrome.cookies.getAll({}, (cookies) => {
            const filteredCookies = cookies.filter((cookie) => {
                const matchesName = !nameFilter || cookie.name.includes(nameFilter);
                const matchesDomain = !domainFilter || cookie.domain.includes(domainFilter);
                const matchesType = typeFilter === "all" || getCookieType(cookie) === typeFilter;
                const matchesExpiration =
                    isNaN(expirationFilter) ||
                    (cookie.expirationDate && daysUntilExpiration(cookie.expirationDate) <= expirationFilter);
                return matchesName && matchesDomain && matchesType && matchesExpiration;
            });

            updateCookieTable(filteredCookies);
        });
    });

    function applyCurrentFilter(cookies) {
        if (currentFilter === "all") {
            return cookies;
        } else if (currentFilter === "essential") {
            return cookies.filter((cookie) => getCookieType(cookie) === "essential");
        } else if (currentFilter === "third-party") {
            return cookies.filter((cookie) => getCookieType(cookie) === "third-party");
        }
        return cookies;
    }

    function deleteSelectedCookies() {
        const checkboxes = document.querySelectorAll(".cookie-checkbox:checked");

        if (checkboxes.length === 0) {
            alert("No cookies selected for deletion.");
            return;
        }

        checkboxes.forEach((checkbox) => {
            const name = checkbox.getAttribute("data-cookie-name");
            const domain = checkbox.getAttribute("data-cookie-domain");
            const url = domain.startsWith(".") ? `https://${domain.slice(1)}` : `https://${domain}`;

            chrome.cookies.remove({ name: name, url: url }, (details) => {
                if (details) {
                    console.log(`Cookie removed: ${details.name}`);
                } else {
                    console.error(`Failed to remove cookie: name=${name}, domain=${domain}`);
                }
            chrome.cookies.getAll({ name: name, domain: domain }, (cookies) => {
                cookies.forEach((cookie) => {
                    chrome.cookies.set({
                        url: url,
                        name: cookie.name,
                        value: cookie.value,
                        expirationDate: Math.floor(Date.now() / 1000) - 1,
                        path: cookie.path,
                        secure: cookie.secure,
                        httpOnly: cookie.httpOnly,
                        sameSite: cookie.sameSite,
                        storeId: cookie.storeId,
                    })
                });
            });
        });
    });

        setTimeout(() => {
            chrome.cookies.getAll({}, (cookies) => {
                const filteredCookies = applyCurrentFilter(cookies); 
                const sortedCookies = applyCurrentSort(filteredCookies);

                updateCookieTable(sortedCookies);
                calculateInsights(cookies);
            });
        }, 500);
    }

    function applyCurrentSort(cookies) {
        if (currentSort.column === null) return cookies;

        const columnMapping = [
            (cookie) => cookie.name.toLowerCase(),
            (cookie) => cookie.domain.toLowerCase(),
            (cookie) => getCookieType(cookie).toLowerCase(),
            (cookie) => formatAccessTime(cookie),
            (cookie) => cookie.expirationDate || 0,
        ];

        return cookies.sort((a, b) => {
            const valueA = columnMapping[currentSort.column](a);
            const valueB = columnMapping[currentSort.column](b);

            if (valueA > valueB) return currentSort.direction;
            if (valueA < valueB) return -currentSort.direction;
            return 0;
        });
    }

    document.getElementById("export-cookies").addEventListener("click", () => {
        chrome.cookies.getAll({}, (cookies) => {
            if (!cookies.length) {
                alert("No cookies available to export.");
                return;
            }

            const headers = ["Name", "Domain", "Type", "Time Accessed", "Expiration Date"];

            const rows = cookies.map((cookie) => {
                const name = cookie.name;
                const domain = cookie.domain;
                const type = getCookieType(cookie);
                const timeAccessed = formatAccessTime(cookie);
                const expirationDate = cookie.expirationDate
                    ? new Date(cookie.expirationDate * 1000).toLocaleDateString()
                    : "Session";

                return [name, domain, type, timeAccessed, expirationDate]
                    .map((field) => `"${String(field).replace(/"/g, '""')}"`)
                    .join(",");
            });

            const csvContent = [headers.join(","), ...rows].join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = "cookies.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });

    function sortTableByColumn(columnIndex) {
        columnIndex -= 1;

        if (columnIndex < 0) { return; }

        const columnMapping = [
            (cookie) => cookie.name.toLowerCase(),
            (cookie) => cookie.domain.toLowerCase(),
            (cookie) => getCookieType(cookie).toLowerCase(),
            (cookie) => formatAccessTime(cookie),
            (cookie) => cookie.expirationDate || 0,
        ];

        chrome.cookies.getAll({}, (cookies) => { 
            if (currentSort.column === columnIndex) {
                currentSort.direction *= -1;
            } else {
                currentSort = { column: columnIndex, direction: 1 };
            }

            const sortedCookies = cookies.sort((a, b) => {
                const valueA = columnMapping[columnIndex](a);
                const valueB = columnMapping[columnIndex](b);

                if (valueA > valueB) return currentSort.direction;
                if (valueA < valueB) return -currentSort.direction;
                return 0;
            });

            updateCookieTable(sortedCookies);

            tableHeaders.forEach((header, index) => {
                header.classList.remove("sort-asc", "sort-desc");
                if (index === columnIndex + 1) {
                    header.classList.add(
                        currentSort.direction === 1 ? "sort-asc" : "sort-desc"
                    );
                }
            });
        });
    }

    const selectAllButton = document.getElementById("select-all");
    const selectThirdPartyButton = document.getElementById("select-third-party");
    const clearSelectionButton = document.getElementById("clear-selection");

    selectAllButton.addEventListener("click", () => {
        selectCookies(() => true);
    });

    selectThirdPartyButton.addEventListener("click", () => {
        selectCookies((cookie) => getCookieType(cookie) === "third-party");
    });

    clearSelectionButton.addEventListener("click", () => {
        clearCookieSelection();
    });

    function selectCookies(condition) {
        chrome.cookies.getAll({}, (cookies) => {
            const checkboxes = document.querySelectorAll(".cookie-checkbox");
            checkboxes.forEach((checkbox) => {
                const name = checkbox.getAttribute("data-cookie-name");
                const domain = checkbox.getAttribute("data-cookie-domain");
                const cookie = cookies.find((c) => c.name === name && c.domain === domain);

                if (cookie && condition(cookie)) {
                    checkbox.checked = true;
                }
            });
        });
    }

    function clearCookieSelection() {
        const checkboxes = document.querySelectorAll(".cookie-checkbox");
        checkboxes.forEach((checkbox) => {
            checkbox.checked = false;
        });
    }
    function generateDomainBarGraph(cookies) {
        const domainCounts = {};

        cookies.forEach((cookie) => {
            const domain = cookie.domain;
            if (domain) {
                if (!domainCounts[domain]) {
                    domainCounts[domain] = 0;
                }
                domainCounts[domain]++;
            }
        }); 

        const sortedDomains = Object.keys(domainCounts).sort((a, b) => domainCounts[b] - domainCounts[a]).slice(0, 10);
        const labels = Object.keys(domainCounts);
        const data = sortedDomains.map(domain => domainCounts[domain]);

        drawDomainBarGraph(labels, data);
    }

    function drawDomainBarGraph(labels, data) {
        const top10Domains = labels.slice(0, 10);
        const top10Data = data.slice(0, 10);
        const ctxBar = document.getElementById('cookiesChart').getContext('2d');
        new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: top10Domains,
                datasets: [{
                    label: 'Number of Cookies',
                    data: top10Data,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    },
                    x: {
                        ticks: {
                            autoSkip: true,
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    }
    function generateExpirationHistogram(cookies) {
        const expirationDates = {};
    
        cookies.forEach((cookie) => {
            if (cookie.expirationDate) {
                const expirationDate = new Date(cookie.expirationDate * 1000);
                const expirationYearMonth = expirationDate.toISOString().substring(0, 7); // Year Month format
                
                if (!expirationDates[expirationYearMonth]) {
                    expirationDates[expirationYearMonth] = 0;
                }
                expirationDates[expirationYearMonth]++;
            }
        });
    
        const labels = Object.keys(expirationDates).sort();
        const data = labels.map((date) => expirationDates[date]);
    
        drawHistogram(labels, data);
    }

    function drawHistogram(labels, data) {
        const ctx = document.getElementById("expiration-histogram").getContext("2d");
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Number of Cookies',
                    data: data,
                    backgroundColor: '#4CAF50',
                    borderColor: '#4CAF50',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Expiration Date (Year-Month)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Number of Cookies'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }
});