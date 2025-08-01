# Transfer Order POS for Zoho Inventory

A simple, fast web application for creating transfer orders in Zoho Inventory with automatic unit conversion between cartons and pieces.

## Features

- 🔐 Secure OAuth authentication with Zoho
- 📦 Automatic product sync from Zoho Inventory
- 🔄 Smart unit conversion (cartons ↔ pieces)
- 🔍 Fast product search by name or SKU
- 🏭 Warehouse selection (from/to)
- 🛒 Cart system for multiple items
- 📱 Clean, mobile-friendly interface

## Prerequisites

- Docker and Docker Compose installed
- Zoho Inventory account with API access
- Client ID and Client Secret from Zoho API Console

## Quick Start with Docker

### 1. Clone the repository
```bash
git clone [your-repo-url]
cd TransferOrderPOS
```

### 2. Configure environment variables
The `.env` file is already configured with your credentials:
```
ZOHO_CLIENT_ID=1000.2EULDEGSDZQAC31GP2YE1YZAEPKDVX
ZOHO_CLIENT_SECRET=1765afc71a79346a81f3ca04af2ea23d94c68e47b2
ZOHO_REDIRECT_URI=https://httpbin.org/anything
ZOHO_ORGANIZATION_ID=150000163897
PORT=3000
```

### 3. Start with Docker Compose
```bash
docker-compose up -d
```

### 4. Access the application
Open your browser and go to: `http://localhost:3000`

## Docker Commands

### Build and start the container
```bash
docker-compose up -d --build
```

### View logs
```bash
docker-compose logs -f
```

### Stop the container
```bash
docker-compose down
```

### Restart the container
```bash
docker-compose restart
```

## Usage Instructions

1. **Connect to Zoho**: Click "Connect to Zoho" and authorize the app
2. **Select Warehouses**: Choose source and destination warehouses
3. **Search Products**: Type product name or SKU in the search bar
4. **Add Items**: 
   - Click on a product
   - Select unit (pieces or cartons if available)
   - Enter quantity
   - Click "Add to Cart"
5. **Create Transfer Order**: Click "Create Transfer Order" when ready

## Unit Conversion

The app automatically detects products with unit information in format "C24PCS" (meaning 1 carton = 24 pieces) and enables conversion between units.

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs

# Rebuild container
docker-compose down
docker-compose up -d --build
```

### Authentication issues
1. Ensure your Zoho API credentials are correct
2. Check that the redirect URI matches your Zoho app settings
3. Try clearing browser cookies and re-authenticating

### Port already in use
Change the port in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Change 3001 to any available port
```

## Development

To run without Docker:
```bash
npm install
npm start
```

## Security Notes

- Never commit `.env` file with real credentials to version control
- Use environment-specific `.env` files for different deployments
- Consider using Docker secrets for production deployments

## Support

For issues or questions, please check the Zoho Inventory API documentation or create an issue in this repository.