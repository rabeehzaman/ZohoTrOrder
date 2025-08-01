let items = [];
let locations = [];
let cart = [];
let currentProduct = null;

// Check if we have auth code or status in URL
window.onload = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const code = urlParams.get('code');
    
    if (authStatus === 'success') {
        showMainContent();
        loadData();
        // Clean URL
        window.history.replaceState({}, document.title, '/');
    } else if (authStatus === 'error') {
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
            }
        } catch (error) {
            console.error('Auth error:', error);
        }
    }
    
    // Show manual code button
    document.getElementById('manual-code-btn').style.display = 'inline-block';
    document.getElementById('custom-scope-btn').style.display = 'inline-block';
    
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
            document.getElementById('status-text').textContent = 'Auto-connecting to Zoho...';
            setTimeout(() => {
                login();
            }, 1000); // Small delay to let UI load
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
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
    document.getElementById('logout-btn').style.display = 'inline-block';
    document.getElementById('sync-btn').style.display = 'inline-block';
    document.getElementById('status-text').textContent = 'Connected';
}

async function logout() {
    try {
        await fetch('/auth/logout', { method: 'POST' });
        
        // Reset UI
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('login-btn').style.display = 'inline-block';
        document.getElementById('logout-btn').style.display = 'none';
        document.getElementById('sync-btn').style.display = 'none';
        document.getElementById('status-text').textContent = '';
        
        // Clear data
        items = [];
        locations = [];
        cart = [];
        updateCartDisplay();
        
        alert('Disconnected successfully. You can now reconnect with new permissions.');
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error disconnecting: ' + error.message);
    }
}

async function loadData() {
    document.getElementById('status-text').textContent = 'Syncing...';
    
    // Load items
    try {
        const itemsResponse = await fetch('/api/items');
        if (!itemsResponse.ok) {
            throw new Error(`HTTP error! status: ${itemsResponse.status}`);
        }
        const itemsData = await itemsResponse.json();
        
        if (itemsData.code === 0) {
            items = itemsData.items || [];
            console.log('Loaded items:', items);
            document.getElementById('items-count').textContent = items.length;
        } else {
            console.error('Zoho API error:', itemsData.message);
            alert('Failed to load items: ' + itemsData.message);
        }
    } catch (error) {
        console.error('Failed to load items:', error);
        alert('Failed to load items. Please check your authentication.');
    }
    
    // Load locations
    try {
        const locationsResponse = await fetch('/api/locations');
        if (!locationsResponse.ok) {
            throw new Error(`HTTP error! status: ${locationsResponse.status}`);
        }
        const locationsData = await locationsResponse.json();
        
        if (locationsData.code === 0) {
            locations = locationsData.locations || [];
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
            alert('Failed to load warehouses: ' + locationsData.message);
        }
    } catch (error) {
        console.error('Failed to load locations:', error);
        alert('Failed to load warehouses. Please check your authentication.');
    }
    
    document.getElementById('status-text').textContent = 'Connected';
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
    // Parse C24PCS or C24P format from unit field
    const match = unit.match(/C(\d+)P(CS)?/i);
    if (match) {
        return `1 Carton = ${match[1]} Pieces`;
    }
    return '';
}

function hasUnitConversion(unit) {
    return /C\d+P(CS)?/i.test(unit);
}

function getPiecesPerCarton(unit) {
    const match = unit.match(/C(\d+)P(CS)?/i);
    return match ? parseInt(match[1]) : 1;
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
        const piecesPerCarton = getPiecesPerCarton(currentProduct.unit);
        
        if (unit === 'pieces') {
            // When pieces selected, show equivalent cartons
            const cartons = quantity / piecesPerCarton;
            displayText = `${cartons.toFixed(3)} CTN`;
            console.log('DEBUG: Converting pieces to cartons', { quantity, piecesPerCarton, cartons });
        } else {
            // When cartons selected, show equivalent pieces  
            const pieces = quantity * piecesPerCarton;
            displayText = `${pieces} PCS`;
            console.log('DEBUG: Converting cartons to pieces', { quantity, piecesPerCarton, pieces });
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
    
    if (currentProduct.unit && hasUnitConversion(currentProduct.unit)) {
        const piecesPerCarton = getPiecesPerCarton(currentProduct.unit);
        
        if (unit === 'pieces') {
            // Convert pieces to cartons for Zoho (pieces ÷ pieces per carton = cartons)
            transferQuantity = quantity / piecesPerCarton;
            displayText = `${quantity} pieces (${transferQuantity.toFixed(3)} cartons)`;
            console.log('DEBUG: addToCart pieces to cartons', { quantity, piecesPerCarton, transferQuantity });
        } else {
            // When cartons selected, keep as cartons for Zoho
            transferQuantity = quantity;
            displayText = `${quantity} cartons (${quantity * piecesPerCarton} pieces)`;
            console.log('DEBUG: addToCart cartons', { quantity, piecesPerCarton, equivalentPieces: quantity * piecesPerCarton });
        }
    } else {
        console.log('DEBUG: addToCart no conversion', { unit, hasUnit: !!currentProduct.unit });
    }
    
    // Check if item already in cart
    const existingItem = cart.find(item => item.item_id === currentProduct.item_id);
    if (existingItem) {
        existingItem.quantity_transfer += transferQuantity;
        existingItem.displayText = displayText;
    } else {
        cart.push({
            item_id: currentProduct.item_id,
            name: currentProduct.name,
            quantity_transfer: transferQuantity,
            unit: currentProduct.unit || 'qty',
            displayText: displayText
        });
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

function showManualCodeInput() {
    document.getElementById('code-popup').style.display = 'flex';
}

function closeCodePopup() {
    document.getElementById('code-popup').style.display = 'none';
    document.getElementById('auth-code-input').value = '';
}

async function submitAuthCode() {
    const code = document.getElementById('auth-code-input').value.trim();
    
    if (!code) {
        alert('Please enter the authorization code');
        return;
    }
    
    try {
        const response = await fetch('/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        
        if (response.ok) {
            closeCodePopup();
            showMainContent();
            loadData();
        } else {
            alert('Invalid authorization code. Please try again.');
        }
    } catch (error) {
        alert('Error submitting code: ' + error.message);
    }
}

function showCustomScopeInput() {
    document.getElementById('scope-popup').style.display = 'flex';
}

function closeScopePopup() {
    document.getElementById('scope-popup').style.display = 'none';
}

async function loginWithCustomScope() {
    const customScope = document.getElementById('custom-scope-input').value.trim();
    
    if (!customScope) {
        alert('Please enter a scope');
        return;
    }
    
    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customScope })
        });
        const data = await response.json();
        closeScopePopup();
        window.location.href = data.authUrl;
    } catch (error) {
        alert('Error: ' + error.message);
    }
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
    
    const transferOrder = {
        // Remove transfer_order_number to let Zoho auto-generate it
        date: new Date().toISOString().split('T')[0],
        from_location_id: String(fromWarehouse),
        to_location_id: String(toWarehouse),
        line_items: cart.map(item => ({
            item_id: item.item_id, // Keep as string to prevent precision loss
            quantity_transfer: parseFloat(item.quantity_transfer)
            // Note: Removed name and unit fields to avoid Zoho API issues
        }))
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
            alert('Error: Invalid response from server');
            return;
        }
        
        if (response.ok) {
            // Extract transfer order details
            const transferOrderId = result.transfer_order.transfer_order_id;
            const transferOrderNumber = result.transfer_order.transfer_order_number;
            
            // Create and trigger PDF download
            try {
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
            } catch (downloadError) {
                console.error('PDF download error:', downloadError);
                // Still show success message even if PDF download fails
            }
            
            alert(`Transfer order ${transferOrderNumber} created successfully! PDF downloading...`);
            
            // Clear cart and reset UI
            cart = [];
            updateCartDisplay();
            document.getElementById('search-input').value = '';
            document.getElementById('search-results').innerHTML = '';
            
            // Focus back to search input
            setTimeout(() => {
                document.getElementById('search-input').focus();
            }, 500);
        } else {
            console.error('Transfer order failed:', result);
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
        alert('Error creating transfer order: ' + error.message);
    }
}