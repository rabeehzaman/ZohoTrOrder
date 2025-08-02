let items = [];
let locations = [];
let cart = [];
let currentProduct = null;

// Loading state management
const LoadingStates = {
    CONNECTING: 'connecting',
    SYNCING: 'syncing', 
    READY: 'ready',
    CREATING_TRANSFER: 'creating_transfer',
    GENERATING_PDF: 'generating_pdf',
    DOWNLOADING_FILE: 'downloading_file'
};

let currentLoadingState = LoadingStates.CONNECTING;
let loadingProgress = {
    items: { current: 0, total: 0 },
    warehouses: { current: 0, total: 0 }
};

function showLoadingState(state, message = '') {
    const overlay = document.getElementById('loading-overlay');
    const title = document.getElementById('loading-title');
    const messageEl = document.getElementById('loading-message');
    const progressContainer = document.getElementById('loading-progress');
    
    currentLoadingState = state;
    overlay.classList.remove('hidden');
    
    switch (state) {
        case LoadingStates.CONNECTING:
            title.textContent = 'Connecting to Zoho...';
            messageEl.textContent = message || 'Please wait while we establish connection';
            progressContainer.style.display = 'none';
            break;
            
        case LoadingStates.SYNCING:
            title.textContent = '✅ Connected to Zoho';
            messageEl.textContent = message || 'Syncing items and warehouses...';
            progressContainer.style.display = 'block';
            updateProgress();
            break;
            
        case LoadingStates.CREATING_TRANSFER:
            title.textContent = '🔄 Creating Transfer Order';
            messageEl.textContent = message || 'Processing your transfer order...';
            progressContainer.style.display = 'none';
            break;
            
        case LoadingStates.GENERATING_PDF:
            title.textContent = '📄 Generating PDF';
            messageEl.textContent = message || 'Creating transfer order document...';
            progressContainer.style.display = 'none';
            break;
            
        case LoadingStates.DOWNLOADING_FILE:
            title.textContent = '⬇️ Downloading File';
            messageEl.textContent = message || 'Downloading transfer order PDF...';
            progressContainer.style.display = 'none';
            break;
            
        case LoadingStates.READY:
            hideLoadingState();
            break;
    }
}

function updateProgress() {
    const itemsProgress = document.getElementById('items-progress');
    const warehousesProgress = document.getElementById('warehouses-progress');
    const progressFill = document.getElementById('progress-fill');
    
    itemsProgress.textContent = `${loadingProgress.items.current}/${loadingProgress.items.total}`;
    warehousesProgress.textContent = `${loadingProgress.warehouses.current}/${loadingProgress.warehouses.total}`;
    
    const totalCurrent = loadingProgress.items.current + loadingProgress.warehouses.current;
    const totalExpected = loadingProgress.items.total + loadingProgress.warehouses.total;
    
    if (totalExpected > 0) {
        const percentage = (totalCurrent / totalExpected) * 100;
        progressFill.style.width = `${percentage}%`;
    }
}

function hideLoadingState() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('hidden');
    currentLoadingState = LoadingStates.READY;
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch((error) => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// PWA Installation
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('PWA install prompt triggered');
    e.preventDefault();
    deferredPrompt = e;
    
    // Show custom install prompt if desired
    // showInstallPrompt();
});

window.addEventListener('appinstalled', (evt) => {
    console.log('PWA was installed');
    deferredPrompt = null;
});

// Check if we have auth code or status in URL
window.onload = async function() {
    // Start with connecting state
    showLoadingState(LoadingStates.CONNECTING);
    
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const code = urlParams.get('code');
    
    if (authStatus === 'success') {
        showMainContent();
        loadData();
        // Clean URL
        window.history.replaceState({}, document.title, '/');
    } else if (authStatus === 'error') {
        hideLoadingState();
        alert('Authentication failed. Please try again.');
        window.history.replaceState({}, document.title, '/');
    } else if (code) {
        // Old flow - exchange code for token
        try {
            const response = await fetch('/auth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            
            if (response.ok) {
                showMainContent();
                loadData();
            } else {
                hideLoadingState();
            }
        } catch (error) {
            console.error('Auth error:', error);
            hideLoadingState();
        }
    }
    
    
    // Check auth status
    checkAuthStatus();
};

async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status');
        const data = await response.json();
        
        console.log('Auth status:', data);
        
        if (data.authenticated) {
            showMainContent();
            loadData();
        } else {
            // Auto-authenticate if not authenticated
            console.log('Not authenticated, auto-connecting to Zoho...');
            showLoadingState(LoadingStates.CONNECTING, 'Auto-connecting to Zoho...');
            setTimeout(() => {
                login();
            }, 1000); // Small delay to let UI load
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        hideLoadingState();
    }
}

async function login() {
    const response = await fetch('/auth/login');
    const data = await response.json();
    window.location.href = data.authUrl;
}

function showMainContent() {
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('sync-btn').style.display = 'inline-block';
    document.getElementById('status-text').textContent = 'Connected';
}

async function loadData() {
    // Switch to syncing state
    showLoadingState(LoadingStates.SYNCING);
    
    // Estimate totals for progress tracking
    loadingProgress.items.total = 2865; // Estimated based on your data
    loadingProgress.warehouses.total = 5; // Estimated based on your data
    
    // Load items with progress tracking
    try {
        const itemsResponse = await fetch('/api/items');
        if (!itemsResponse.ok) {
            throw new Error(`HTTP error! status: ${itemsResponse.status}`);
        }
        const itemsData = await itemsResponse.json();
        
        if (itemsData.code === 0) {
            items = itemsData.items || [];
            console.log('Loaded items:', items);
            
            // Update progress
            loadingProgress.items.current = items.length;
            loadingProgress.items.total = items.length; // Actual count
            updateProgress();
            
            document.getElementById('items-count').textContent = items.length;
        } else {
            console.error('Zoho API error:', itemsData.message);
            hideLoadingState();
            alert('Failed to load items: ' + itemsData.message);
            return;
        }
    } catch (error) {
        console.error('Failed to load items:', error);
        hideLoadingState();
        alert('Failed to load items. Please check your authentication.');
        return;
    }
    
    // Load locations with progress tracking
    try {
        const locationsResponse = await fetch('/api/locations');
        if (!locationsResponse.ok) {
            throw new Error(`HTTP error! status: ${locationsResponse.status}`);
        }
        const locationsData = await locationsResponse.json();
        
        if (locationsData.code === 0) {
            locations = locationsData.locations || [];
            
            // Update progress
            loadingProgress.warehouses.current = locations.length;
            loadingProgress.warehouses.total = locations.length; // Actual count
            updateProgress();
            
            document.getElementById('warehouses-count').textContent = locations.length;
            
            // Clear existing options
            const fromSelect = document.getElementById('from-warehouse');
            const toSelect = document.getElementById('to-warehouse');
            
            // Keep the first empty option
            fromSelect.innerHTML = '<option value="">Select warehouse...</option>';
            toSelect.innerHTML = '<option value="">Select warehouse...</option>';
            
            // Populate warehouse dropdowns
            locations.forEach((location, index) => {
                const option1 = new Option(location.location_name, String(location.location_id));
                const option2 = new Option(location.location_name, String(location.location_id));
                fromSelect.add(option1);
                toSelect.add(option2);
                
                // Set first warehouse as default for FROM warehouse
                if (index === 0) {
                    fromSelect.value = String(location.location_id);
                }
            });
        } else {
            console.error('Zoho API error:', locationsData.message);
            hideLoadingState();
            alert('Failed to load warehouses: ' + locationsData.message);
            return;
        }
    } catch (error) {
        console.error('Failed to load locations:', error);
        hideLoadingState();
        alert('Failed to load warehouses. Please check your authentication.');
        return;
    }
    
    // All data loaded successfully - hide loading overlay
    setTimeout(() => {
        hideLoadingState();
        document.getElementById('status-text').textContent = 'Connected';
    }, 500); // Small delay to show completion
}

function syncData() {
    loadData();
}

let searchTimeout;

function searchProducts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const resultsDiv = document.getElementById('search-results');
    
    if (!searchTerm) {
        resultsDiv.innerHTML = '';
        return;
    }
    
    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm))
    );
    
    if (filteredItems.length === 0) {
        resultsDiv.innerHTML = '<div class="empty-state">No products found</div>';
        return;
    }
    
    resultsDiv.innerHTML = filteredItems.map(item => `
        <div class="product-item" onclick="selectProduct('${item.item_id}')">
            <div class="product-info">
                <div class="product-name">${item.name}</div>
                <div class="product-details">
                    SKU: ${item.sku || 'N/A'} | 
                    Unit: ${item.unit || 'qty'}
                    ${item.unit ? ` | ${parseUnitInfo(item.unit)}` : ''}
                </div>
            </div>
            ${item.unit && hasUnitConversion(item.unit) ? 
                `<div class="product-unit">${parseUnitInfo(item.unit)}</div>` : ''}
        </div>
    `).join('');
}

function searchProductsWithDelay() {
    // Clear existing timeout
    clearTimeout(searchTimeout);
    
    // Set new timeout for delayed search
    searchTimeout = setTimeout(() => {
        searchProducts();
    }, 300); // 300ms delay
}

function parseUnitInfo(unit) {
    if (!hasUnitConversion(unit)) return '';
    
    const unitsPerContainer = getUnitsPerContainer(unit);
    const containerName = getContainerName(unit);
    
    // Capitalize first letter of container name
    const capitalizedContainer = containerName.charAt(0).toUpperCase() + containerName.slice(1, -1);
    
    return `1 ${capitalizedContainer} = ${unitsPerContainer} Pieces`;
}

function hasUnitConversion(unit) {
    if (!unit) return false;
    
    // Pattern 1: C##P format (existing: C12P, C24P, etc.)
    if (/C\d+P(CS)?/i.test(unit)) return true;
    
    // Pattern 2: UNIT(number) format (BAG(8), CTN(144), etc.)
    // Also includes C3(RPT) style patterns
    if (/\w+\(\d+\w*\)/i.test(unit)) return true;
    
    // Pattern 3: C## format without P (C54, C2, etc.)
    if (/C\d+$/i.test(unit)) return true;
    
    // Pattern 4: Multi-part CTN format (CTN 6(10), CTN(4)10)
    if (/CTN\s*\d+\(\d+\)|CTN\(\d+\)\d+/i.test(unit)) return true;
    
    // Pattern 5: CTN with P suffix (CTN(720P))
    if (/CTN\(\d+P\)/i.test(unit)) return true;
    
    return false;
}

function getUnitsPerContainer(unit) {
    if (!unit) return 1;
    
    // Pattern 1: C##P format (C12P, C24P → 12, 24)
    let match = unit.match(/C(\d+)P(CS)?/i);
    if (match) return parseInt(match[1]);
    
    // Pattern 2: UNIT(number) format (BAG(8), CTN(144) → 8, 144)
    // Also handles C3(RPT) → 3 (ignore text after number)
    // But skip multi-part patterns that should be handled later
    if (!/CTN\s*\d+\(|\(\d+\)\d+/.test(unit)) {
        match = unit.match(/\w+\((\d+)\w*\)/i);
        if (match) return parseInt(match[1]);
    }
    
    // Pattern 3: C## format without P (C54, C2 → 54, 2)
    match = unit.match(/C(\d+)$/i);
    if (match) return parseInt(match[1]);
    
    // Pattern 4: CTN 6(10) format (6×10 = 60)
    match = unit.match(/CTN\s*(\d+)\((\d+)\)/i);
    if (match) return parseInt(match[1]) * parseInt(match[2]);
    
    // Pattern 5: CTN(4)10 format (4×10 = 40)
    match = unit.match(/CTN\((\d+)\)(\d+)/i);
    if (match) return parseInt(match[1]) * parseInt(match[2]);
    
    // Pattern 6: CTN(720P) format (720)
    match = unit.match(/CTN\((\d+)P\)/i);
    if (match) return parseInt(match[1]);
    
    return 1;
}

function getContainerName(unit) {
    if (!unit) return 'units';
    
    // Detect container type from unit name
    if (/BAG|B\(/i.test(unit)) return 'bags';
    if (/CTN|CARTON/i.test(unit)) return 'cartons';
    if (/C\d+/i.test(unit)) return 'cartons';
    if (/OUTER/i.test(unit)) return 'outers';
    if (/TIN/i.test(unit)) return 'tins';
    if (/DZN|DOZEN/i.test(unit)) return 'dozens';
    
    return 'units'; // fallback
}

// Round quantity to 4 decimal places for consistent precision
function roundQuantity(quantity) {
    return Math.round(quantity * 10000) / 10000;
}

// Keep backward compatibility
function getPiecesPerCarton(unit) {
    return getUnitsPerContainer(unit);
}

function selectProduct(itemId) {
    currentProduct = items.find(item => item.item_id == itemId);
    if (!currentProduct) return;
    
    document.getElementById('popup-product-name').textContent = currentProduct.name;
    
    // Check if product has carton information
    const hasCartonInfo = currentProduct.unit && hasUnitConversion(currentProduct.unit);
    const cartonRadio = document.getElementById('unit-cartons');
    const cartonLabel = cartonRadio.nextElementSibling;
    
    if (hasCartonInfo) {
        const piecesPerCarton = getPiecesPerCarton(currentProduct.unit);
        document.getElementById('carton-info').textContent = `${piecesPerCarton} pcs`;
        cartonRadio.disabled = false;
        cartonLabel.style.opacity = '1';
    } else {
        cartonRadio.disabled = true;
        cartonLabel.style.opacity = '0.5';
        document.getElementById('unit-pieces').checked = true;
    }
    
    document.getElementById('quantity-input').value = 1;
    updateCalculatedQuantity();
    document.getElementById('quantity-popup').style.display = 'flex';
    
    // Focus on pieces radio button for arrow key navigation
    setTimeout(() => {
        const piecesRadio = document.getElementById('unit-pieces');
        piecesRadio.focus();
        
        // Setup popup keyboard navigation
        setupPopupNavigation();
    }, 100);
}

function updateCalculatedQuantity() {
    const quantity = parseFloat(document.getElementById('quantity-input').value) || 0;
    const unit = document.querySelector('input[name="unit"]:checked').value;
    
    console.log('DEBUG: updateCalculatedQuantity called', { quantity, unit, productUnit: currentProduct?.unit });
    
    let displayText;
    
    if (currentProduct.unit && hasUnitConversion(currentProduct.unit)) {
        const piecesPerContainer = getPiecesPerCarton(currentProduct.unit);
        const containerName = getContainerName(currentProduct.unit);
        
        if (unit === 'pieces') {
            // When pieces selected, show equivalent containers
            const containers = roundQuantity(quantity / piecesPerContainer);
            // Use abbreviation for display
            const containerAbbr = containerName === 'bags' ? 'BAG' : 
                                 containerName === 'cartons' ? 'CTN' : 
                                 containerName === 'dozens' ? 'DZN' : 'UNIT';
            displayText = `${containers.toFixed(4)} ${containerAbbr}`;
            console.log('DEBUG: Converting pieces to containers', { quantity, piecesPerContainer, containers, containerName });
        } else {
            // When containers selected, show equivalent pieces  
            const pieces = quantity * piecesPerContainer;
            displayText = `${pieces} PCS`;
            console.log('DEBUG: Converting containers to pieces', { quantity, piecesPerContainer, pieces, containerName });
        }
    } else {
        displayText = `${quantity} ${unit}`;
    }
    
    document.getElementById('calculated-qty').textContent = displayText;
}

// Update calculated quantity when inputs change
document.addEventListener('DOMContentLoaded', function() {
    // Quantity popup event listeners
    document.getElementById('quantity-input').addEventListener('input', updateCalculatedQuantity);
    document.querySelectorAll('input[name="unit"]').forEach(radio => {
        radio.addEventListener('change', updateCalculatedQuantity);
    });
    
    // Search input event listener for real-time search
    document.getElementById('search-input').addEventListener('input', searchProductsWithDelay);
    
    // Keyboard navigation
    setupKeyboardNavigation();
});

function setupKeyboardNavigation() {
    let selectedProductIndex = -1;
    const searchInput = document.getElementById('search-input');
    
    // Enhanced Tab navigation setup
    setupTabNavigation();
    
    document.addEventListener('keydown', function(e) {
        // Global keyboard shortcuts (except when in input fields)
        if (e.target.tagName === 'INPUT' && e.target.id !== 'search-input') return;
        if (e.target.tagName === 'SELECT') return;
        
        const resultsDiv = document.getElementById('search-results');
        const productItems = resultsDiv.querySelectorAll('.product-item');
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (productItems.length > 0) {
                    selectedProductIndex = Math.min(selectedProductIndex + 1, productItems.length - 1);
                    updateSelectedProduct(productItems, selectedProductIndex);
                }
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (productItems.length > 0) {
                    selectedProductIndex = Math.max(selectedProductIndex - 1, 0);
                    updateSelectedProduct(productItems, selectedProductIndex);
                }
                break;
                
            case 'Enter':
                e.preventDefault();
                if (selectedProductIndex >= 0 && productItems[selectedProductIndex]) {
                    const itemId = productItems[selectedProductIndex].getAttribute('onclick').match(/'([^']+)'/)[1];
                    selectProduct(itemId);
                } else if (document.getElementById('quantity-popup').style.display === 'flex') {
                    addToCart();
                } else if (e.target.id === 'create-transfer-btn') {
                    createTransferOrder();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                closePopup();
                selectedProductIndex = -1;
                updateSelectedProduct(productItems, -1);
                break;
                
            case 'F2':
                e.preventDefault();
                createTransferOrder();
                break;
        }
    });
    
    // Reset selection when search changes
    searchInput.addEventListener('input', function() {
        selectedProductIndex = -1;
    });
    
    // Quantity input keyboard handling
    document.getElementById('quantity-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addToCart();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
        }
    });
}

function setupTabNavigation() {
    const searchInput = document.getElementById('search-input');
    const fromWarehouse = document.getElementById('from-warehouse');
    const toWarehouse = document.getElementById('to-warehouse');
    const createTransferBtn = document.getElementById('create-transfer-btn');
    
    // Tab order: search ↔ create-transfer-btn (skip warehouses)
    const tabOrder = [searchInput, createTransferBtn];
    
    tabOrder.forEach((element, index) => {
        element.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const nextIndex = (index + 1) % tabOrder.length;
                const nextElement = tabOrder[nextIndex];
                
                // Auto-open dropdown for select elements
                if (nextElement.tagName === 'SELECT') {
                    nextElement.focus();
                    // Use multiple methods to open dropdown
                    setTimeout(() => {
                        // Method 1: Trigger mousedown event
                        const mousedownEvent = new MouseEvent('mousedown', {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        });
                        nextElement.dispatchEvent(mousedownEvent);
                        
                        // Method 2: Set size temporarily to show options
                        nextElement.size = nextElement.options.length;
                        setTimeout(() => {
                            nextElement.size = 1;
                        }, 100);
                    }, 50);
                } else {
                    nextElement.focus();
                }
            }
        });
    });
    
    // Special handling for warehouse dropdowns
    fromWarehouse.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            toWarehouse.focus();
            setTimeout(() => {
                if (toWarehouse.click) toWarehouse.click();
            }, 50);
        }
    });
    
    toWarehouse.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchInput.focus();
        }
    });
    
    // Create Transfer Order button keyboard handling
    createTransferBtn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            createTransferOrder();
        }
    });
}

function setupPopupNavigation() {
    const quantityInput = document.getElementById('quantity-input');
    const piecesRadio = document.getElementById('unit-pieces');
    const cartonsRadio = document.getElementById('unit-cartons');
    
    // Remove any existing event listeners to avoid duplicates
    const newQuantityInput = quantityInput.cloneNode(true);
    quantityInput.parentNode.replaceChild(newQuantityInput, quantityInput);
    
    // Tab navigation within popup: quantity → unit selection → quantity
    newQuantityInput.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            // Focus on the checked radio button
            const checkedRadio = document.querySelector('input[name="unit"]:checked');
            if (checkedRadio) {
                checkedRadio.focus();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addToCart();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closePopup();
        }
    });
    
    // Radio button navigation
    [piecesRadio, cartonsRadio].forEach(radio => {
        radio.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                newQuantityInput.focus();
                newQuantityInput.select();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                addToCart();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePopup();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                // Toggle between pieces and cartons
                if (this.id === 'unit-pieces' && !cartonsRadio.disabled) {
                    cartonsRadio.checked = true;
                    cartonsRadio.focus();
                } else if (this.id === 'unit-cartons') {
                    piecesRadio.checked = true;
                    piecesRadio.focus();
                }
                updateCalculatedQuantity();
            }
        });
    });
}

function updateSelectedProduct(productItems, selectedIndex) {
    // Remove previous selection
    productItems.forEach(item => item.classList.remove('selected'));
    
    // Add selection to current item
    if (selectedIndex >= 0 && productItems[selectedIndex]) {
        productItems[selectedIndex].classList.add('selected');
        productItems[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

function addToCart() {
    const quantity = parseFloat(document.getElementById('quantity-input').value) || 0;
    const unit = document.querySelector('input[name="unit"]:checked').value;
    
    if (quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
    }
    
    let transferQuantity = quantity;
    let displayText = `${quantity} ${unit}`;
    let itemDescription = '';
    
    if (currentProduct.unit && hasUnitConversion(currentProduct.unit)) {
        const piecesPerCarton = getPiecesPerCarton(currentProduct.unit);
        
        if (unit === 'pieces') {
            // Convert pieces to containers for Zoho (pieces ÷ pieces per container = containers)
            transferQuantity = roundQuantity(quantity / piecesPerCarton);
            const containerName = getContainerName(currentProduct.unit);
            displayText = `${quantity} pieces (${transferQuantity.toFixed(4)} ${containerName})`;
            itemDescription = `Original: ${quantity} pieces (converted to ${transferQuantity.toFixed(4)} ${containerName})`;
            console.log('DEBUG: addToCart pieces to containers', { quantity, piecesPerCarton, transferQuantity, containerName });
            console.log('DEBUG: Setting description:', itemDescription);
        } else {
            // When containers selected, keep as containers for Zoho
            transferQuantity = quantity;
            const containerName = getContainerName(currentProduct.unit);
            displayText = `${quantity} ${containerName} (${quantity * piecesPerCarton} pieces)`;
            console.log('DEBUG: addToCart containers', { quantity, piecesPerCarton, equivalentPieces: quantity * piecesPerCarton, containerName });
        }
    } else {
        console.log('DEBUG: addToCart no conversion', { unit, hasUnit: !!currentProduct.unit });
    }
    
    // Check if item already in cart
    const existingItem = cart.find(item => item.item_id === currentProduct.item_id);
    if (existingItem) {
        existingItem.quantity_transfer += transferQuantity;
        existingItem.displayText = displayText;
        if (itemDescription) {
            existingItem.description = itemDescription;
            console.log('DEBUG: Updated existing item description:', itemDescription);
        }
    } else {
        const cartItem = {
            item_id: currentProduct.item_id,
            name: currentProduct.name,
            quantity_transfer: transferQuantity,
            unit: currentProduct.unit || 'qty',
            displayText: displayText
        };
        
        if (itemDescription) {
            cartItem.description = itemDescription;
            console.log('DEBUG: Added description to new cart item:', itemDescription);
        }
        
        cart.push(cartItem);
        console.log('DEBUG: Cart item added:', cartItem);
    }
    
    updateCartDisplay();
    closePopup();
    
    // Return focus to search input for next item
    setTimeout(() => {
        document.getElementById('search-input').focus();
    }, 100);
}

function updateCartDisplay() {
    const cartDiv = document.getElementById('cart-items');
    
    if (cart.length === 0) {
        cartDiv.innerHTML = '<div class="empty-state">No items in transfer order</div>';
        return;
    }
    
    cartDiv.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-quantity">${item.displayText}</div>
            </div>
            <button class="remove-btn" onclick="removeFromCart(${index})">Remove</button>
        </div>
    `).join('');
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartDisplay();
}

function closePopup() {
    document.getElementById('quantity-popup').style.display = 'none';
    document.getElementById('quantity-input').value = 1;
    currentProduct = null;
}



async function createTransferOrder() {
    const fromWarehouse = document.getElementById('from-warehouse').value;
    const toWarehouse = document.getElementById('to-warehouse').value;
    
    console.log('Selected warehouses:', { fromWarehouse, toWarehouse });
    console.log('Available locations:', locations);
    console.log('Cart items:', cart);
    
    if (!fromWarehouse || !toWarehouse) {
        alert('Please select both from and to warehouses');
        return;
    }
    
    if (fromWarehouse === toWarehouse) {
        alert('From and To warehouses must be different');
        return;
    }
    
    if (cart.length === 0) {
        alert('Please add items to the transfer order');
        return;
    }
    
    // Show creating transfer loading state
    showLoadingState(LoadingStates.CREATING_TRANSFER);
    
    const transferOrder = {
        // Remove transfer_order_number to let Zoho auto-generate it
        date: new Date().toISOString().split('T')[0],
        from_location_id: String(fromWarehouse),
        to_location_id: String(toWarehouse),
        line_items: cart.map(item => {
            const lineItem = {
                item_id: item.item_id, // Keep as string to prevent precision loss
                name: item.name,
                quantity_transfer: parseFloat(item.quantity_transfer),
                unit: item.unit
            };
            
            // Include description if it exists (piece conversion info)
            if (item.description) {
                lineItem.description = item.description;
                console.log('DEBUG: Adding description to transfer order line item:', item.description);
            } else {
                console.log('DEBUG: No description found for item:', item.name);
            }
            
            return lineItem;
        })
    };
    
    console.log('Transfer order data:', transferOrder);
    
    try {
        const response = await fetch('/api/transfer-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transferOrder)
        });
        
        let result;
        try {
            result = await response.json();
        } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            hideLoadingState();
            alert('Error: Invalid response from server');
            return;
        }
        
        if (response.ok) {
            // Extract transfer order details
            const transferOrderId = result.transfer_order.transfer_order_id;
            const transferOrderNumber = result.transfer_order.transfer_order_number;
            
            // Show PDF generation loading state
            showLoadingState(LoadingStates.GENERATING_PDF);
            
            // Create and trigger PDF download
            try {
                // Show downloading loading state
                showLoadingState(LoadingStates.DOWNLOADING_FILE);
                
                const downloadLink = document.createElement('a');
                downloadLink.href = `/api/transfer-orders/${transferOrderId}/pdf`;
                downloadLink.download = `TransferOrder-${transferOrderNumber}.pdf`;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                
                // Click the link to start download
                downloadLink.click();
                
                // Clean up
                setTimeout(() => {
                    document.body.removeChild(downloadLink);
                }, 100);
                
                // Hide loading after download starts
                setTimeout(() => {
                    hideLoadingState();
                    
                    // Clear cart and reset UI
                    cart = [];
                    updateCartDisplay();
                    document.getElementById('search-input').value = '';
                    document.getElementById('search-results').innerHTML = '';
                    
                    // Focus back to search input
                    setTimeout(() => {
                        document.getElementById('search-input').focus();
                    }, 100);
                }, 1000); // Give time for download to start
                
            } catch (downloadError) {
                console.error('PDF download error:', downloadError);
                hideLoadingState();
                alert('Transfer order created but PDF download failed');
            }
        } else {
            console.error('Transfer order failed:', result);
            hideLoadingState();
            let errorMsg = 'Failed to create transfer order: ';
            if (result.details && result.details.code) {
                errorMsg += `Code ${result.details.code}: ${result.details.message}`;
            } else {
                errorMsg += (result.error || result.details?.message || 'Unknown error');
            }
            alert(errorMsg);
        }
    } catch (error) {
        console.error('Network error:', error);
        hideLoadingState();
        alert('Error creating transfer order: ' + error.message);
    }
}