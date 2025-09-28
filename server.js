const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Store tokens persistently in file (with fallback for containers)
const fs = require('fs');
const path = require('path');
const os = require('os');

// Try to use writable temp directory in containers, fallback to current directory
let tokenFile;
try {
    // Test if current directory is writable
    const testFile = path.join(__dirname, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    tokenFile = path.join(__dirname, 'tokens.json');
    console.log('Using current directory for tokens file');
} catch (error) {
    // Use system temp directory if current directory is not writable
    tokenFile = path.join(os.tmpdir(), 'zoho-tokens.json');
    console.log('Using temp directory for tokens file:', tokenFile);
}

let accessToken = null;
let refreshToken = null;
let tokenExpiresAt = null;

// Load tokens from file on startup
function loadTokens() {
    try {
        // First try to load from file
        if (fs.existsSync(tokenFile)) {
            const fileContent = fs.readFileSync(tokenFile, 'utf8').trim();
            if (fileContent) {
                const tokens = JSON.parse(fileContent);
                
                // Validate that all required tokens exist
                if (tokens.accessToken && tokens.refreshToken) {
                    accessToken = tokens.accessToken;
                    refreshToken = tokens.refreshToken;
                    tokenExpiresAt = tokens.expiresAt || null;
                    console.log('✅ Loaded saved tokens from file');
                    if (tokenExpiresAt) {
                        const expiresIn = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
                        console.log(`Token expires in ${expiresIn} seconds`);
                    }
                    return;
                } else {
                    console.log('⚠️ Incomplete tokens found in file, clearing corrupted data');
                    clearTokens();
                }
            }
        }
        
        // Fallback: try to load from environment variables (for containers)
        if (process.env.ZOHO_ACCESS_TOKEN && process.env.ZOHO_REFRESH_TOKEN) {
            accessToken = process.env.ZOHO_ACCESS_TOKEN;
            refreshToken = process.env.ZOHO_REFRESH_TOKEN;
            // Load expiry time if available, otherwise set to 1 hour from now
            tokenExpiresAt = process.env.ZOHO_TOKEN_EXPIRES_AT 
                ? parseInt(process.env.ZOHO_TOKEN_EXPIRES_AT) 
                : Date.now() + (3600 * 1000);
            console.log('📦 Loaded tokens from environment variables (container mode)');
            if (tokenExpiresAt) {
                const expiresIn = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
                console.log(`Token expires in ${expiresIn} seconds`);
            }
        } else {
            console.log('ℹ️  No saved tokens found - authentication required');
        }
    } catch (error) {
        console.error('Error loading tokens:', error);
    }
}

// Save tokens to file
function saveTokens() {
    try {
        // Only save if we have valid tokens
        if (!accessToken || !refreshToken) {
            console.log('⚠️ Skipping save - missing required tokens');
            return;
        }
        
        const tokens = {
            accessToken,
            refreshToken,
            expiresAt: tokenExpiresAt,
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
        console.log('✅ Tokens saved to file:', tokenFile);
        if (tokenExpiresAt) {
            const expiresIn = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
            console.log(`Token expires in ${expiresIn} seconds`);
        }
    } catch (error) {
        console.error('⚠️  Warning: Could not save tokens to file:', error.message);
        console.log('📝 Tokens will remain in memory until container restart');
        // Don't throw error - tokens still work in memory
    }
}

// Clear tokens from file
function clearTokens() {
    try {
        if (fs.existsSync(tokenFile)) {
            fs.unlinkSync(tokenFile);
            console.log('✅ Tokens file deleted');
        }
    } catch (error) {
        console.error('⚠️  Warning: Could not delete tokens file:', error.message);
        // Don't throw error - tokens are cleared from memory regardless
    }
}


// Load tokens on startup
loadTokens();

// Refresh tokens on startup if they're expired or about to expire
async function refreshTokensOnStartup() {
    // Wait a moment for tokens to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (!accessToken || !refreshToken) {
        console.log('⏭️  Skipping startup token refresh - no tokens available');
        return;
    }
    
    try {
        // Check if token is expired or expires in next 10 minutes
        if (!tokenExpiresAt || Date.now() + (10 * 60 * 1000) >= tokenExpiresAt) {
            console.log('🔄 Refreshing tokens on startup...');
            await refreshAccessToken();
        } else {
            const expiresIn = Math.floor((tokenExpiresAt - Date.now()) / 1000);
            console.log(`✅ Token still valid for ${expiresIn} seconds`);
        }
    } catch (error) {
        console.error('⚠️  Startup token refresh failed:', error.message);
        // Don't crash - user can still authenticate manually
    }
}

// Schedule token refresh on startup
refreshTokensOnStartup();

// Zoho OAuth endpoints
const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const ZOHO_API_URL = 'https://www.zohoapis.com/inventory/v1';

// Dynamic redirect URI based on environment
function getRedirectUri() {
    // Railway provides RAILWAY_PUBLIC_DOMAIN for the app URL
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/auth/callback`;
    }
    // Use environment variable if explicitly set
    if (process.env.ZOHO_REDIRECT_URI) {
        return process.env.ZOHO_REDIRECT_URI;
    }
    // Default to localhost for development
    return 'http://localhost:3000/auth/callback';
}

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
        willRefreshIn: expiresIn ? Math.max(0, expiresIn - 300) : null, // 5 minutes before expiry
        railwaySetupUrl: accessToken && refreshToken ? '/auth/tokens' : null
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
        `&redirect_uri=${encodeURIComponent(getRedirectUri())}` +
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
        `&redirect_uri=${getRedirectUri()}` +
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
                redirect_uri: getRedirectUri(),
                code: code
            }
        });
        
        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;
        tokenExpiresAt = Date.now() + (tokenResponse.data.expires_in * 1000 || 3600 * 1000);
        
        // Save tokens to file
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
    console.log('Redirect URI:', getRedirectUri());
    
    try {
        const tokenResponse = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
            params: {
                grant_type: 'authorization_code',
                client_id: process.env.ZOHO_CLIENT_ID,
                client_secret: process.env.ZOHO_CLIENT_SECRET,
                redirect_uri: getRedirectUri(),
                code: code
            }
        });
        
        console.log('Token exchange successful!');
        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;
        tokenExpiresAt = Date.now() + (tokenResponse.data.expires_in * 1000 || 3600 * 1000);
        
        // Save tokens to file
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
            // Filter criteria for inventory items - include items not enabled for sales since transfers are internal operations
            return item.item_type === 'inventory' && 
                   item.status === 'active' && 
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
        
        // Log detailed structure to understand locations
        const sampleLocation = response.data.locations?.[0];
        if (sampleLocation) {
            console.log('Sample location structure:', JSON.stringify({
                location_id: sampleLocation.location_id,
                location_name: sampleLocation.location_name,
                type: sampleLocation.type,
                is_location_active: sampleLocation.is_location_active,
                warehouses: sampleLocation.warehouses
            }, null, 2));
        }
        
        // For organizations using locations directly (no nested warehouses)
        // Use locations as warehouses for transfer orders
        const allWarehouses = [];

        response.data.locations?.forEach(location => {
            // Check if location has nested warehouses first
            if (location.warehouses?.length > 0) {
                // Add nested warehouses (original logic)
                location.warehouses.forEach(warehouse => {
                    if (warehouse.status === 'active') {
                        allWarehouses.push({
                            location_id: warehouse.warehouse_id,
                            location_name: `${warehouse.warehouse_name} (${location.location_name})`,
                            warehouse_id: warehouse.warehouse_id,
                            warehouse_name: warehouse.warehouse_name,
                            parent_location_id: location.location_id,
                            parent_location_name: location.location_name,
                            status: warehouse.status
                        });
                        console.log(`Added nested warehouse: ${warehouse.warehouse_name}`);
                    }
                });
            } else {
                // Use location directly as a warehouse option
                if (location.is_location_active !== false) {
                    allWarehouses.push({
                        location_id: location.location_id,
                        location_name: location.location_name,
                        warehouse_id: location.location_id,
                        warehouse_name: location.location_name,
                        type: location.type || 'location',
                        status: 'active'
                    });
                    console.log(`Using location as warehouse: ${location.location_name} (${location.type || 'location'})`);
                }
            }
        });

        console.log(`Total transfer locations available: ${allWarehouses.length}`);
        
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

// Display tokens for manual Railway setup
app.get('/auth/tokens', (req, res) => {
    if (!accessToken) {
        return res.status(401).json({
            error: 'No access token available. Please authenticate first.'
        });
    }
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Railway Environment Variables</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; }
                .env-var { background: #f0f0f0; padding: 15px; margin: 10px 0; border-radius: 4px; font-family: monospace; word-break: break-all; }
                .instructions { background: #e3f2fd; padding: 20px; border-radius: 4px; margin: 20px 0; }
                .warning { background: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; border: 1px solid #ffeaa7; }
                button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
                button:hover { background: #45a049; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Railway Environment Variables Setup</h1>
                
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong> These tokens are sensitive. Only use this page for initial Railway setup, then close it immediately.
                </div>
                
                ${!refreshToken ? `
                <div class="warning">
                    <strong>⚠️ Missing Refresh Token:</strong> Your OAuth flow didn't return a refresh token. This might be due to Zoho app configuration. You can still use the access token, but it will expire in ~1 hour.
                </div>
                ` : ''}
                
                <div class="instructions">
                    <h2>Instructions:</h2>
                    <ol>
                        <li>Copy each environment variable below</li>
                        <li>Go to your Railway project settings</li>
                        <li>Add these as environment variables</li>
                        <li>Restart your Railway service</li>
                        <li>Your app will stay authenticated permanently</li>
                    </ol>
                </div>
                
                <h2>Environment Variables to Add:</h2>
                
                <div class="env-var">
                    <strong>ZOHO_ACCESS_TOKEN</strong><br>
                    <span id="access-token">${accessToken}</span>
                    <button onclick="copyToClipboard('access-token', this)">Copy</button>
                </div>
                
                ${refreshToken ? `
                <div class="env-var">
                    <strong>ZOHO_REFRESH_TOKEN</strong><br>
                    <span id="refresh-token">${refreshToken}</span>
                    <button onclick="copyToClipboard('refresh-token', this)">Copy</button>
                </div>
                ` : `
                <div class="env-var" style="background: #ffebee;">
                    <strong>ZOHO_REFRESH_TOKEN</strong><br>
                    <span style="color: #d32f2f;">❌ Not available - Check Zoho OAuth app configuration</span>
                </div>
                `}
                
                <div class="env-var">
                    <strong>ZOHO_TOKEN_EXPIRES_AT</strong><br>
                    <span id="expires-at">${tokenExpiresAt || ''}</span>
                    <button onclick="copyToClipboard('expires-at', this)">Copy</button>
                </div>
                
                <div style="margin-top: 30px;">
                    <button onclick="window.location.href='/'">← Back to App</button>
                </div>
            </div>
            
            <script>
                function copyToClipboard(id, button) {
                    const text = document.getElementById(id).textContent;
                    navigator.clipboard.writeText(text).then(() => {
                        button.textContent = 'Copied!';
                        setTimeout(() => button.textContent = 'Copy', 2000);
                    });
                }
            </script>
        </body>
        </html>
    `;
    
    res.send(html);
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.RAILWAY_ENVIRONMENT || 'local',
        auth: {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            tokenValid: tokenExpiresAt ? Date.now() < tokenExpiresAt : false,
            expiresIn: tokenExpiresAt ? Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000)) : null
        },
        config: {
            redirectUri: getRedirectUri(),
            hasClientId: !!process.env.ZOHO_CLIENT_ID,
            hasClientSecret: !!process.env.ZOHO_CLIENT_SECRET,
            hasOrgId: !!process.env.ZOHO_ORGANIZATION_ID
        }
    };
    
    res.json(health);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});