// Reusable vanilla autocomplete component powered by Photon Komoot API
(function() {
    // Inject styles for the autocomplete dropdown dynamically
    const style = document.createElement('style');
    style.textContent = `
        .autocomplete-suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            width: 100%;
            background: #ffffff;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            max-height: 250px;
            overflow-y: auto;
            z-index: 9999;
            margin: 4px 0 0 0;
            padding: 0;
            list-style: none;
            box-sizing: border-box;
        }
        .autocomplete-suggestion {
            padding: 10px 15px;
            cursor: pointer;
            font-size: 14px;
            border-bottom: 1px solid #f3f4f6;
            color: #293241;
            transition: background 0.15s ease;
            text-align: left;
        }
        .autocomplete-suggestion:last-child {
            border-bottom: none;
        }
        .autocomplete-suggestion:hover, .autocomplete-suggestion.active {
            background-color: #f3f4f6;
        }
        .autocomplete-suggestion-title {
            font-weight: 600;
            color: #1a202c;
        }
        .autocomplete-suggestion-subtitle {
            font-size: 12px;
            color: #718096;
            margin-top: 2px;
        }
    `;
    document.head.appendChild(style);

    window.initCustomAutocomplete = function(inputEl, options = {}) {
        if (!inputEl) return null;

        // Parent must have relative positioning (already has in .form-group)
        const parent = inputEl.parentNode;
        
        const list = document.createElement('ul');
        list.className = 'autocomplete-suggestions';
        list.style.display = 'none';
        parent.appendChild(list);

        let timeout = null;
        let activeIndex = -1;
        let suggestions = [];
        let bias = null;

        function showSuggestions(items) {
            suggestions = items;
            list.innerHTML = '';
            activeIndex = -1;

            if (items.length === 0) {
                list.style.display = 'none';
                return;
            }

            items.forEach((item, index) => {
                const li = document.createElement('li');
                li.className = 'autocomplete-suggestion';
                
                const title = document.createElement('div');
                title.className = 'autocomplete-suggestion-title';
                title.textContent = item.name;
                
                const subtitle = document.createElement('div');
                subtitle.className = 'autocomplete-suggestion-subtitle';
                
                const parts = [];
                if (item.city) parts.push(item.city);
                if (item.state && item.state !== item.city) parts.push(item.state);
                if (item.country) parts.push(item.country);
                subtitle.textContent = parts.join(', ');

                li.appendChild(title);
                if (parts.length > 0) {
                    li.appendChild(subtitle);
                }

                li.addEventListener('click', () => selectItem(item));
                list.appendChild(li);
            });

            list.style.display = 'block';
        }

        function selectItem(item) {
            const parts = [item.name];
            if (item.city && item.city !== item.name) parts.push(item.city);
            if (item.country) parts.push(item.country);
            
            inputEl.value = parts.join(', ');
            list.style.display = 'none';
            
            if (options.onSelect) {
                options.onSelect(item);
            }
        }

        function fetchResults(query) {
            let url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5&lang=es`;
            
            // Apply coordinate bias if available (biases results to selected destination)
            if (bias && bias.lat && bias.lon) {
                url += `&lat=${bias.lat}&lon=${bias.lon}`;
            }

            fetch(url)
                .then(res => res.json())
                .then(data => {
                    const items = (data.features || []).map(f => ({
                        name: f.properties.name || '',
                        city: f.properties.city || f.properties.town || '',
                        state: f.properties.state || '',
                        country: f.properties.country || '',
                        lat: f.geometry.coordinates[1],
                        lon: f.geometry.coordinates[0]
                    }));
                    showSuggestions(items);
                })
                .catch(err => {
                    console.error('Error fetching autocomplete suggestions:', err);
                });
        }

        inputEl.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = inputEl.value.trim();
            
            if (query.length < 3) {
                list.style.display = 'none';
                return;
            }

            timeout = setTimeout(() => {
                fetchResults(query);
            }, 300);
        });

        // Keyboard navigation
        inputEl.addEventListener('keydown', (e) => {
            const items = list.querySelectorAll('.autocomplete-suggestion');
            if (list.style.display === 'none' || items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = (activeIndex + 1) % items.length;
                updateActiveSuggestion(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = (activeIndex - 1 + items.length) % items.length;
                updateActiveSuggestion(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < suggestions.length) {
                    selectItem(suggestions[activeIndex]);
                }
            } else if (e.key === 'Escape') {
                list.style.display = 'none';
            }
        });

        function updateActiveSuggestion(items) {
            items.forEach((item, index) => {
                if (index === activeIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!parent.contains(e.target)) {
                list.style.display = 'none';
            }
        });

        return {
            setBias: (newBias) => {
                bias = newBias;
            }
        };
    };
})();
