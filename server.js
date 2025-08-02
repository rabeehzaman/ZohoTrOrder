const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Store tokens persistently in file
const fs = require('fs');
const path = require('path');
const tokenFile = path.join(__dirname, 'tokens.json');

let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = null;

// Load tokens from file on startup
function loadTokens() {
    try {
        if (fs.existsSync(tokenFile)) {
            const fileContent = fs.readFileSync(tokenFile, 'utf8').trim();
            if (fileContent) {
                const tokens = JSON.parse(fileContent);
                accessToken = tokens.accessToken;
                refreshToken = tokens.refreshToken;
                tokenExpiresAt = tokens.expiresAt || null;
                console.log('Loaded saved tokens from file');
                if (tokenExpiresAt) {
                    const expiresIn = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
                    console.log(`Token expires in ${expiresIn} seconds`);
                }
            } else {
                console.log('Tokens file is empty');
            }
        }
    } catch (error) {
        console.error('Error loading tokens:', error);
    }
}

// Save tokens to file
function saveTokens() {
    try {
        const tokens = {
            accessToken,
            refreshToken,
            expiresAt: tokenExpiresAt,
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
        console.log('Tokens saved to file');
        if (tokenExpiresAt) {
            const expiresIn = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
            console.log(`Token expires in ${expiresIn} seconds`);
        }
    } catch (error) {
        console.error('Error saving tokens:', error);
    }
}

// Clear tokens from file
function clearTokens() {
    try {
        if (fs.existsSync(tokenFile)) {
            fs.unlinkSync(tokenFile);
            console.log('Tokens file deleted');
        }
    } catch (error) {
        console.error('Error clearing tokens:', error);
    }
}

// Load tokens on startup
loadTokens();

// Zoho OAuth endpoints
const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.sa';
const ZOHO_API_URL = 'https://www.zohoapis.sa/inventory/v1';

// Check authentication status
app.get('/auth/status', (req, res) => {
    const now = Date.now();
    const expiresIn = tokenExpiresAt ? Math.max(0, Math.floor((tokenExpiresAt - now) / 1000)) : null;
    const expiresInMinutes = expiresIn ? Math.floor(expiresIn / 60) : null;
    
    res.json({ 
        authenticated: !!accessToken,
        hasRefreshToken: !!refreshToken,
        tokenExpiresIn: expiresIn,
        tokenExpiresInMinutes: expiresInMinutes,
        autoRefreshEnabled: true,
        willRefreshIn: expiresIn ? Math.max(0, expiresIn - 300) : null // 5 minutes before expiry
    });
});

// Logout/disconnect
app.post('/auth/logout', (req, res) => {
    console.log('Logging out - clearing tokens');
    accessToken = null;
    refreshToken = null;
    tokenExpiresAt = null;
    clearTokens();
    res.json({ success: true, message: 'Logged out successfully' });
});

// OAuth flow - Step 1: Redirect to Zoho login
app.get('/auth/login', (req, res) => {
    const authUrl = `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?` +
        `scope=ZohoInventory.fullaccess.all` +
        `&client_id=${process.env.ZOHO_CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(process.env.ZOHO_REDIRECT_URI)}` +
        `&access_type=offline`;
    
    res.json({ authUrl });
});

// OAuth flow - Step 1 (with custom scope): Redirect to Zoho login
app.post('/auth/login', (req, res) => {
    const { customScope } = req.body;
    const scope = customScope || 'ZohoInventory.fullaccess.all';
    
    console.log('Using custom scope:', scope);
    
    const authUrl = `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?` +
        `scope=${encodeURIComponent(scope)}` +
        `&client_id=${process.env.ZOHO_CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${process.env.ZOHO_REDIRECT_URI}` +
        `&access_type=offline`;
    
    res.json({ authUrl });
});

// OAuth flow - Step 2: Handle callback from Zoho
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    
    if (!code) {
        return res.send('Error: No authorization code received');
    }
    
    try {
        const tokenResponse = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                grant_type: 'authorization_code',
                client_id: process.env.ZOHO_CLIENT_ID,
                client_secret: process.env.ZOHO_CLIENT_SECRET,
                redirect_uri: process.env.ZOHO_REDIRECT_URI,
                code: code
            }
        });
        
        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;
        tokenExpiresAt = Date.now() + (tokenResponse.data.expires_in * 1000 || 3600 * 1000);
        saveTokens();
        
        // Redirect to main app with success message
        res.redirect('/?auth=success');
    } catch (error) {
        console.error('Token exchange error:', error.response?.data || error);
        res.redirect('/?auth=error');
    }
});

// OAuth flow - Step 2 (alternative): Exchange code for token via POST
app.post('/auth/token', async (req, res) => {
    const { code } = req.body;
    
    console.log('Attempting to exchange code for token...');
    console.log('Code:', code);
    console.log('Client ID:', process.env.ZOHO_CLIENT_ID);
    console.log('Redirect URI:', process.env.ZOHO_REDIRECT_URI);
    
    try {
        const tokenResponse = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                grant_type: 'authorization_code',
                client_id: process.env.ZOHO_CLIENT_ID,
                client_secret: process.env.ZOHO_CLIENT_SECRET,
                redirect_uri: process.env.ZOHO_REDIRECT_URI,
                code: code
            }
        });
        
        console.log('Token exchange successful!');
        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;
        tokenExpiresAt = Date.now() + (tokenResponse.data.expires_in * 1000 || 3600 * 1000);
        saveTokens();
        
        res.json({ success: true, message: 'Authentication successful' });
    } catch (error) {
        console.error('Token exchange error:', error.response?.data || error);
        res.status(400).json({ 
            error: 'Failed to exchange code for token',
            details: error.response?.data || error.message
        });
    }
});

// Refresh token when expired
async function refreshAccessToken() {
    try {
        console.log('🔄 Refreshing Zoho access token...');
        const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                grant_type: 'refresh_token',
                client_id: process.env.ZOHO_CLIENT_ID,
                client_secret: process.env.ZOHO_CLIENT_SECRET,
                refresh_token: refreshToken
            }
        });
        
        accessToken = response.data.access_token;
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000 || 3600 * 1000);
        saveTokens();
        console.log('✅ Access token refreshed successfully');
        return accessToken;
    } catch (error) {
        console.error('❌ Token refresh error:', error);
        throw error;
    }
}

// Proactive token refresh - call before every API request
async function ensureValidToken() {
    // Refresh if token expires in the next 5 minutes
    if (!tokenExpiresAt || Date.now() + (5 * 60 * 1000) >= tokenExpiresAt) {
        if (!refreshToken) {
            throw new Error('No refresh token available. Please login again.');
        }
        await refreshAccessToken();
    }
}

// Get all items from Zoho Inventory
app.get('/api/items', async (req, res) => {
    console.log('Fetching items from Zoho Inventory...');
    console.log('Access token exists:', !!accessToken);
    
    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated. Please login first.' });
    }
    
    try {
        await ensureValidToken();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
    }
    
    try {
        let allItems = [];
        let page = 1;
        let hasMorePages = true;
        
        // Fetch all pages of items
        while (hasMorePages) {
            console.log(`Fetching items page ${page}...`);
            
            const response = await axios.get(`${ZOHO_API_URL}/items`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`
                },
                params: {
                    organization_id: process.env.ZOHO_ORGANIZATION_ID,
                    per_page: 1000,  // Zoho's actual max per page (optimized for faster loading)
                    page: page
                }
            });
            
            if (response.data.items && response.data.items.length > 0) {
                allItems = allItems.concat(response.data.items);
                console.log(`Page ${page}: ${response.data.items.length} items, Total: ${allItems.length}`);
                
                // Check if there are more pages
                if (response.data.items.length < 1000) {
                    hasMorePages = false;
                } else {
                    page++;
                }
            } else {
                hasMorePages = false;
            }
        }
        
        console.log('All items fetched successfully:', allItems.length);
        
        // Debug: Check item types
        const itemTypes = {};
        allItems.forEach(item => {
            const type = item.item_type || 'undefined';
            itemTypes[type] = (itemTypes[type] || 0) + 1;
        });
        console.log('Item types found:', itemTypes);
        
        // Filter only inventory items (exclude services, non-inventory items)
        const inventoryItems = allItems.filter(item => {
            // Filter criteria for inventory items
            return item.item_type === 'inventory' && 
                   item.status === 'active' && 
                   item.is_returnable !== false &&
                   !item.is_combo_product &&
                   item.track_inventory === true &&
                   item.product_type === 'goods';
        });
        
        console.log(`Filtered to ${inventoryItems.length} inventory items from ${allItems.length} total items`);
        
        // Return in the same format as original response
        res.json({
            code: 0,
            message: 'success',
            items: inventoryItems
        });
    } catch (error) {
        console.error('Error fetching items:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to fetch items',
            details: error.response?.data || error.message 
        });
    }
});

// Get warehouses from locations - each location contains nested warehouses
app.get('/api/locations', async (req, res) => {
    console.log('Fetching locations with warehouses from Zoho Inventory...');
    
    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated. Please login first.' });
    }
    
    try {
        await ensureValidToken();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
    }
    
    try {
        const response = await axios.get(`${ZOHO_API_URL}/locations`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
            },
            params: {
                organization_id: process.env.ZOHO_ORGANIZATION_ID
            }
        });
        
        console.log('Locations fetched successfully:', response.data.locations?.length || 0);
        console.log('Raw API response structure:', JSON.stringify({
            code: response.data.code,
            message: response.data.message,
            locations_count: response.data.locations?.length || 0,
            first_location_keys: response.data.locations?.[0] ? Object.keys(response.data.locations[0]) : [],
            first_location_sample: response.data.locations?.[0]
        }, null, 2));
        
        // Log detailed structure to understand nested warehouses
        const sampleLocation = response.data.locations?.[0];
        if (sampleLocation) {
            console.log('Sample location structure:', JSON.stringify({
                location_id: sampleLocation.location_id,
                location_name: sampleLocation.location_name,
                is_storage_location_enabled: sampleLocation.is_storage_location_enabled,
                warehouses_count: sampleLocation.warehouses?.length || 0,
                warehouses: sampleLocation.warehouses
            }, null, 2));
        }
        
        // Extract actual warehouses from nested structure within locations
        // Include all warehouses even if storage location is not enabled
        const allWarehouses = [];
        
        response.data.locations?.forEach(location => {
            if (location.warehouses?.length > 0) {
                // Add warehouses from this location (only active ones)
                location.warehouses.forEach(warehouse => {
                    if (warehouse.status === 'active') {
                        allWarehouses.push({
                            location_id: warehouse.warehouse_id, // Use warehouse_id for transfer orders
                            location_name: `${warehouse.warehouse_name} (${location.location_name})`,
                            warehouse_id: warehouse.warehouse_id,
                            warehouse_name: warehouse.warehouse_name,
                            parent_location_id: location.location_id,
                            parent_location_name: location.location_name,
                            parent_location_storage_enabled: location.is_storage_location_enabled,
                            status: warehouse.status,
                            is_primary: warehouse.is_primary || false
                        });
                        console.log(`Added active warehouse: ${warehouse.warehouse_name} (${warehouse.warehouse_id})`);
                    } else {
                        console.log(`Skipped inactive warehouse: ${warehouse.warehouse_name} (${warehouse.warehouse_id}) - status: ${warehouse.status}`);
                    }
                });
                console.log(`Found ${location.warehouses.length} warehouses in location '${location.location_name}' (storage enabled: ${location.is_storage_location_enabled})`);
            } else {
                console.log(`No warehouses found in location '${location.location_name}'`);
            }
        });
        
        console.log(`Found ${allWarehouses.length} warehouses from ${response.data.locations?.length || 0} locations`);
        
        const transformedData = {
            code: response.data.code,
            message: response.data.message,
            locations: allWarehouses
        };
        
        res.json(transformedData);
    } catch (error) {
        console.error('Error fetching locations:', error.response?.data || error.message);
        console.error('Full error response:', error.response);
        res.status(500).json({ 
            error: 'Failed to fetch locations',
            details: error.response?.data || error.message,
            status: error.response?.status
        });
    }
});

// Create transfer order
app.post('/api/transfer-orders', async (req, res) => {
    console.log('Creating transfer order with data:', JSON.stringify(req.body, null, 2));
    
    try {
        await ensureValidToken();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
    }
    
    try {
        // Fetch all items using optimal per_page=1000 with pagination for remaining items
        console.log('Fetching all items with optimized pagination (per_page=1000)...');
        const itemMap = {};
        let totalItemsFetched = 0;
        let page = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
            const itemsResponse = await axios.get(`${ZOHO_API_URL}/items`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`
                },
                params: {
                    organization_id: process.env.ZOHO_ORGANIZATION_ID,
                    per_page: 1000,
                    page: page
                }
            });
            
            if (itemsResponse.data.items && itemsResponse.data.items.length > 0) {
                itemsResponse.data.items.forEach(item => {
                    itemMap[item.item_id] = item.name;
                });
                totalItemsFetched += itemsResponse.data.items.length;
                console.log(`Fetched page ${page}: ${itemsResponse.data.items.length} items (Total: ${totalItemsFetched})`);
            }
            
            hasMorePages = itemsResponse.data.page_context?.has_more_page || false;
            page++;
        }
        
        console.log(`Completed item fetching: ${totalItemsFetched} total items loaded`);
        
        // Validate all items exist in itemMap before creating transfer order
        for (const item of req.body.line_items) {
            if (!itemMap[item.item_id]) {
                return res.status(400).json({
                    error: `Item ${item.item_id} not found in inventory`,
                    details: `This item is not available in the current inventory list. Please refresh and try again.`
                });
            }
        }
        
        // Use correct field names as per Zoho API documentation
        const transferOrderData = {
            from_warehouse_id: String(req.body.from_location_id),
            to_warehouse_id: String(req.body.to_location_id),
            date: req.body.date || new Date().toISOString().split('T')[0],
            line_items: req.body.line_items.map(item => {
                const lineItem = {
                    item_id: String(item.item_id),
                    name: itemMap[item.item_id], // No fallback - we've already validated it exists
                    quantity_transfer: Number(item.quantity_transfer),
                    unit: "qty" // Always use qty since it works universally
                };
                
                // Add description if provided (contains piece conversion info)
                if (item.description) {
                    lineItem.description = item.description;
                }
                
                return lineItem;
            })
        };
        
        console.log('Formatted transfer order data:', JSON.stringify(transferOrderData, null, 2));
        
        const response = await axios.post(`${ZOHO_API_URL}/transferorders`, transferOrderData, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json'
            },
            params: {
                organization_id: process.env.ZOHO_ORGANIZATION_ID
            }
        });
        
        console.log('Transfer order created successfully:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Transfer order error:', error.response?.data || error);
        res.status(500).json({ 
            error: 'Failed to create transfer order',
            details: error.response?.data || error.message
        });
    }
});

// Test endpoint to verify code changes
app.get('/test', (req, res) => {
    res.json({ 
        message: 'Updated code is running',
        timestamp: new Date().toISOString(),
        hasToken: !!accessToken
    });
});

// Test both locations and warehouses endpoints to understand structure
app.get('/test/locations', async (req, res) => {
    if (!accessToken) {
        return res.json({ error: 'Not authenticated' });
    }
    
    try {
        await ensureValidToken();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
    }
    
    try {
        let locResponse, whResponse;
        
        // Try both endpoints
        try {
            locResponse = await axios.get(`${ZOHO_API_URL}/locations`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`
                },
                params: {
                    organization_id: process.env.ZOHO_ORGANIZATION_ID
                }
            });
        } catch (locError) {
            console.log('Direct locations endpoint failed:', locError.response?.status);
        }
        
        whResponse = await axios.get(`${ZOHO_API_URL}/settings/warehouses`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
            },
            params: {
                organization_id: process.env.ZOHO_ORGANIZATION_ID
            }
        });
        
        // Extract all nested warehouses for analysis
        const extractedWarehouses = [];
        whResponse.data.warehouses?.forEach(location => {
            if (location.warehouses?.length > 0) {
                location.warehouses.forEach(warehouse => {
                    extractedWarehouses.push({
                        warehouse_id: warehouse.warehouse_id,
                        warehouse_name: warehouse.warehouse_name,
                        parent_location: location.location_name,
                        parent_location_id: location.location_id,
                        storage_enabled: location.is_storage_location_enabled
                    });
                });
            }
        });
        
        res.json({
            direct_locations: locResponse ? {
                url: `${ZOHO_API_URL}/locations`,
                count: locResponse.data.locations?.length || 0,
                sample: locResponse.data.locations?.slice(0, 1)
            } : { error: 'Direct locations endpoint not accessible' },
            settings_warehouses: {
                url: `${ZOHO_API_URL}/settings/warehouses`,
                count: whResponse.data.warehouses?.length || 0,
                locations_with_storage: whResponse.data.warehouses?.filter(loc => loc.is_storage_location_enabled).length || 0,
                total_nested_warehouses: extractedWarehouses.length,
                sample_location: whResponse.data.warehouses?.[0] ? {
                    location_id: whResponse.data.warehouses[0].location_id,
                    location_name: whResponse.data.warehouses[0].location_name,
                    storage_enabled: whResponse.data.warehouses[0].is_storage_location_enabled,
                    warehouses_count: whResponse.data.warehouses[0].warehouses?.length || 0,
                    sample_warehouse: whResponse.data.warehouses[0].warehouses?.[0]
                } : null,
                extracted_warehouses: extractedWarehouses
            }
        });
    } catch (error) {
        res.json({ 
            error: error.message,
            details: error.response?.data
        });
    }
});

// Debug endpoint to show locations data
app.get('/debug/locations', async (req, res) => {
    if (!accessToken) {
        return res.json({ error: 'Not authenticated' });
    }
    
    try {
        await ensureValidToken();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
    }
    
    try {
        const response = await axios.get(`${ZOHO_API_URL}/locations`, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
            },
            params: {
                organization_id: process.env.ZOHO_ORGANIZATION_ID
            }
        });
        
        res.json({
            count: response.data.locations?.length || 0,
            locations: response.data.locations?.map(location => ({
                location_id: location.location_id,
                location_name: location.location_name,
                id_type: typeof location.location_id,
                status: location.status
            }))
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

// Download transfer order as PDF
app.get('/api/transfer-orders/:id/pdf', async (req, res) => {
    console.log('Downloading transfer order PDF:', req.params.id);
    
    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated. Please login first.' });
    }
    
    try {
        await ensureValidToken();
    } catch (error) {
        console.error('Token validation failed:', error);
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
    }
    
    try {
        const response = await axios.get(
            `${ZOHO_API_URL}/transferorders/${req.params.id}`,
            {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Accept': 'application/pdf'
                },
                params: {
                    organization_id: process.env.ZOHO_ORGANIZATION_ID
                },
                responseType: 'stream'
            }
        );
        
        console.log('PDF download response received, streaming to client');
        
        // Set appropriate headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="TransferOrder-${req.params.id}.pdf"`);
        
        // Pipe the PDF stream directly to the response
        response.data.pipe(res);
        
    } catch (error) {
        console.error('PDF download error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to download PDF',
            details: error.response?.data || error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});