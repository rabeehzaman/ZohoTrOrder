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
            locations.forEach(location => {
                const option1 = new Option(location.location_name, String(location.location_id));
                const option2 = new Option(location.location_name, String(location.location_id));
                fromSelect.add(option1);
                toSelect.add(option2);
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
                    ${item.unit && hasUnitConversion(item.unit) ? ` | ${parseUnitInfo(item.unit)}` : ''}
                </div>
            </div>
            ${item.unit && hasUnitConversion(item.unit) ? 
                `<div class="product-unit">${parseUnitInfo(item.unit)}</div>` : ''}
        </div>
    `).join('');
}

function parseUnitInfo(unit) {
    // Parse C24PCS or C24P format from unit (with or without hyphen)
    const match = unit.match(/C-?(\d+)P(CS)?/i);
    if (match) {
        return `1 Carton = ${match[1]} Pieces`;
    }
    return '';
}

function hasUnitConversion(unit) {
    return /C-?\d+P(CS)?/i.test(unit) || /C\d+\([^)]*\)/i.test(unit);
}

function getPiecesPerCarton(unit) {
    // Check for C#P format first
    let match = unit.match(/C-?(\d+)P(CS)?/i);
    if (match) return parseInt(match[1]);
    
    // Check for C#(...) format - extract number after C, ignore parentheses content
    match = unit.match(/C(\d+)\([^)]*\)/i);
    if (match) return parseInt(match[1]);
    
    return 1;
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
}

function updateCalculatedQuantity() {
    const quantity = parseFloat(document.getElementById('quantity-input').value) || 0;
    const unit = document.querySelector('input[name="unit"]:checked').value;
    
    let calculatedQty = quantity;
    
    if (unit === 'pieces' && currentProduct.unit && hasUnitConversion(currentProduct.unit)) {
        const piecesPerCarton = getPiecesPerCarton(currentProduct.unit);
        calculatedQty = quantity / piecesPerCarton;
    }
    
    document.getElementById('calculated-qty').textContent = calculatedQty.toFixed(3);
}

// Update calculated quantity when inputs change
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('quantity-input').addEventListener('input', updateCalculatedQuantity);
    document.querySelectorAll('input[name="unit"]').forEach(radio => {
        radio.addEventListener('change', updateCalculatedQuantity);
    });
});

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
    
    // Debug logging
    console.log('addToCart debug:', {
        unit: unit,
        currentProductUnit: currentProduct.unit,
        hasConversion: hasUnitConversion(currentProduct.unit),
        quantity: quantity
    });
    
    if (unit === 'pieces' && currentProduct.unit && hasUnitConversion(currentProduct.unit)) {
        const piecesPerCarton = getPiecesPerCarton(currentProduct.unit);
        transferQuantity = quantity / piecesPerCarton;
        displayText = `${quantity} pieces (${transferQuantity.toFixed(3)} cartons)`;
        itemDescription = `Original: ${quantity} pieces (converted to ${transferQuantity.toFixed(3)} cartons)`;
        console.log('Conversion applied:', { piecesPerCarton, transferQuantity, itemDescription });
    }
    
    // Check if item already in cart
    const existingItem = cart.find(item => item.item_id === currentProduct.item_id);
    if (existingItem) {
        existingItem.quantity_transfer += transferQuantity;
        existingItem.displayText = displayText;
        if (itemDescription) {
            existingItem.description = itemDescription;
            console.log('Setting description on existing item:', itemDescription);
        }
        console.log('Updated existing cart item:', existingItem);
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
            console.log('Setting description on cart item:', itemDescription);
        }
        
        console.log('Cart item being added:', cartItem);
        cart.push(cartItem);
    }
    
    updateCartDisplay();
    closePopup();
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
                console.log('Adding description to line item:', item.description);
            } else {
                console.log('No description found for item:', item.name);
            }
            
            return lineItem;
        })
    };
    
    console.log('Cart before creating transfer order:', cart);
    console.log('Transfer order data being sent:', transferOrder);
    
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
            alert('Transfer order created successfully!');
            cart = [];
            updateCartDisplay();
            document.getElementById('search-input').value = '';
            document.getElementById('search-results').innerHTML = '';
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