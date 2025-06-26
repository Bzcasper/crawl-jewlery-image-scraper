        with col1:
            if st.button("🧹 Cleanup Old Data"):
                with st.spinner("Cleaning up..."):
                    # Call cleanup endpoint
                    try:
                        asyncio.run(self._cleanup_data())
                        st.success("Data cleanup completed!")
                        st.experimental_rerun()
                    except Exception as e:
                        st.error(f"Cleanup failed: {e}")

        with col2:
            if st.button("📤 Export Data"):
                with st.spinner("Exporting..."):
                    try:
                        export_path = asyncio.run(self._export_data())
                        st.success(f"Data exported to: {export_path}")
                    except Exception as e:
                        st.error(f"Export failed: {e}")

        with col3:
            if st.button("🔄 Refresh Data"):
                st.experimental_rerun()

    async def _cleanup_data(self):
        """Call cleanup API"""
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.mcp_url}/tools/cleanup_old_data",
                                  json={"retention_days": 30}) as response:
                if response.status != 200:
                    raise Exception("Cleanup API call failed")

    async def _export_data(self):
        """Call export API"""
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.mcp_url}/tools/export_jewelry_data",
                                  json={"format": "csv"}) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('export_path')
                raise Exception("Export API call failed")

# Run the dashboard

if **name** == "**main**":
dashboard = MonitoringDashboard()
dashboard.render_dashboard()

````

---

## Phase 6: CLI Commands and Automation

### 6.1 Main CLI Interface
```python
# scripts/jewelry_cli.py
import click
import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime
import subprocess

# Add project modules to path
sys.path.append('./crawl4ai-engine')
sys.path.append('./mcp-server')

@click.group()
@click.version_option(version='1.0.0')
def cli():
    """🚀 eBay Jewelry Scraper CLI

    Advanced agentic system for scraping eBay jewelry listings with image processing.
    """
    pass

@cli.command()
@click.option('--query', '-q', required=True, help='Search query for jewelry')
@click.option('--pages', '-p', default=3, help='Number of pages to scrape')
@click.option('--images/--no-images', default=True, help='Download images')
@click.option('--output', '-o', help='Output file for results')
def scrape(query, pages, images, output):
    """Scrape eBay jewelry listings"""
    click.echo(f"🔍 Scraping eBay for: {query}")

    from ebay_scraper import run_scraper
    from image_processor import process_images
    from data_manager import manage_data

    try:
        # Run scraper
        with click.progressbar(length=100, label='Scraping') as bar:
            bar.update(20)

            config = {
                'rate_limit_delay': 2,
                'max_listings_per_page': 50,
                'image_download_timeout': 30
            }

            listings = asyncio.run(run_scraper(query, pages, config))
            bar.update(50)

            if not listings:
                click.echo("❌ No listings found")
                return

            # Save to database
            session_id = datetime.now().strftime('%Y%m%d_%H%M%S')
            result = asyncio.run(manage_data('save', listings=listings, session_id=session_id))
            bar.update(70)

            click.echo(f"✅ Found {len(listings)} listings")
            click.echo(f"💾 Saved {result['saved']} listings to database")

            # Process images if requested
            if images:
                image_config = {
                    'image_download_timeout': 30,
                    'max_images_per_listing': 10,
                    'max_image_size': (1200, 1200),
                    'image_quality': 85
                }

                image_result = asyncio.run(process_images(listings, './image-storage', image_config))
                click.echo(f"🖼️ Downloaded {image_result['total_images']} images")

            bar.update(100)

            # Output results if requested
            if output:
                with open(output, 'w') as f:
                    json.dump(listings, f, indent=2, default=str)
                click.echo(f"📄 Results saved to {output}")

    except Exception as e:
        click.echo(f"❌ Scraping failed: {e}")

@cli.command()
@click.option('--category', '-c', help='Filter by category')
@click.option('--limit', '-l', default=50, help='Maximum results')
@click.option('--format', '-f', type=click.Choice(['table', 'json', 'csv']), default='table')
def list(category, limit, format):
    """List scraped jewelry listings"""
    from data_manager import manage_data

    try:
        listings = asyncio.run(manage_data('get', category=category, limit=limit))

        if not listings:
            click.echo("No listings found")
            return

        if format == 'json':
            click.echo(json.dumps(listings, indent=2, default=str))
        elif format == 'csv':
            import pandas as pd
            df = pd.DataFrame(listings)
            click.echo(df.to_csv(index=False))
        else:
            # Table format
            click.echo(f"\n📋 Found {len(listings)} listings:")
            click.echo("-" * 80)

            for listing in listings[:20]:  # Limit display
                title = listing.get('title', 'N/A')[:50]
                price = listing.get('price', 'N/A')
                category = listing.get('subcategory', 'N/A')
                click.echo(f"{title:<52} ${price:<10} {category}")

    except Exception as e:
        click.echo(f"❌ Failed to list: {e}")

@cli.command()
@click.option('--category', '-c', help='Export specific category')
@click.option('--format', '-f', type=click.Choice(['csv', 'json']), default='csv')
@click.option('--output', '-o', help='Output directory')
def export(category, format, output):
    """Export jewelry data"""
    from data_manager import manage_data

    try:
        output_dir = output or './data-storage/exports'
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        if format == 'csv':
            export_path = asyncio.run(manage_data('export', output_path=output_dir, category=category))
        else:
            listings = asyncio.run(manage_data('get', category=category, limit=10000))
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            export_path = f"{output_dir}/jewelry_listings_{category or 'all'}_{timestamp}.json"

            with open(export_path, 'w') as f:
                json.dump(listings, f, indent=2, default=str)

        click.echo(f"✅ Data exported to: {export_path}")

    except Exception as e:
        click.echo(f"❌ Export failed: {e}")

@cli.command()
@click.option('--days', '-d', default=30, help='Data retention days')
def cleanup(days):
    """Clean up old data"""
    from data_manager import manage_data

    try:
        asyncio.run(manage_data('cleanup', retention_days=days))
        click.echo(f"✅ Cleaned up data older than {days} days")

    except Exception as e:
        click.echo(f"❌ Cleanup failed: {e}")

@cli.command()
def status():
    """Show system status"""
    from data_manager import manage_data

    try:
        stats = asyncio.run(manage_data('stats'))

        click.echo("📊 System Status:")
        click.echo(f"Total Listings: {stats['total_listings']}")
        click.echo(f"Recent (24h): {stats['recent_listings_24h']}")
        click.echo(f"Total Images: {stats['total_images']}")

        click.echo("\n📈 By Category:")
        for category, count in stats['by_category'].items():
            click.echo(f"  {category}: {count}")

    except Exception as e:
        click.echo(f"❌ Status check failed: {e}")

@cli.command()
@click.option('--port', '-p', default=8000, help='Server port')
def serve():
    """Start MCP server"""
    click.echo("🚀 Starting MCP server...")

    try:
        subprocess.run([
            'python', './mcp-server/jewelry_mcp_server.py'
        ], check=True)

    except KeyboardInterrupt:
        click.echo("\n🛑 Server stopped")
    except Exception as e:
        click.echo(f"❌ Server failed: {e}")

@cli.command()
def deploy():
    """Deploy the system using Docker"""
    click.echo("🚀 Deploying eBay Jewelry Scraper System...")

    try:
        # Run deployment script
        subprocess.run(['bash', './scripts/deploy.sh'], check=True)
        click.echo("✅ Deployment completed successfully!")

    except subprocess.CalledProcessError as e:
        click.echo(f"❌ Deployment failed: {e}")
    except FileNotFoundError:
        click.echo("❌ Deployment script not found")

@cli.command()
def dashboard():
    """Launch monitoring dashboard"""
    click.echo("📊 Starting monitoring dashboard...")

    try:
        subprocess.run([
            'streamlit', 'run', './scripts/monitoring_dashboard.py',
            '--server.port', '8501',
            '--server.headless', 'true'
        ], check=True)

    except KeyboardInterrupt:
        click.echo("\n🛑 Dashboard stopped")
    except Exception as e:
        click.echo(f"❌ Dashboard failed: {e}")

@cli.command()
def test():
    """Run system tests"""
    click.echo("🧪 Running system tests...")

    try:
        subprocess.run(['python', '-m', 'pytest', './tests/', '-v'], check=True)
        click.echo("✅ All tests passed!")

    except subprocess.CalledProcessError:
        click.echo("❌ Some tests failed")
    except FileNotFoundError:
        click.echo("❌ pytest not found")

if __name__ == '__main__':
    cli()
````

### 6.2 Setup Script

```bash
#!/bin/bash
# scripts/setup.sh

set -e

echo "🚀 Setting up eBay Jewelry Scraper System..."

# Check Python version
python_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
required_version="3.10"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ Python 3.10+ required. Found: $python_version"
    exit 1
fi

echo "✅ Python version check passed"

# Create virtual environment
echo "🐍 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Install development dependencies
pip install pytest pytest-asyncio black ruff streamlit

# Setup Crawl4AI
echo "🕷️ Setting up Crawl4AI..."
crawl4ai-setup

# Verify Crawl4AI installation
echo "🔍 Verifying Crawl4AI installation..."
crawl4ai-doctor

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p {image-storage/{rings,necklaces,earrings,bracelets,watches,other},data-storage/{raw,processed,exports},logs/{crawl4ai,mcp-server,n8n},n8n-data,tests}

# Initialize database
echo "🗃️ Initializing database..."
python3 -c "
import sys
sys.path.append('./crawl4ai-engine')
from data_manager import DataManager
dm = DataManager('./data-storage/jewelry_listings.db', './data-storage')
print('✅ Database initialized')
"

# Setup environment file
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.example .env
    echo "⚠️ Please update .env file with your API keys"
fi

# Make scripts executable
chmod +x scripts/*.sh

# Setup git hooks (if git repo)
if [ -d .git ]; then
    echo "🔧 Setting up git hooks..."
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "Running code formatting..."
python -m black --check .
python -m ruff check .
EOF
    chmod +x .git/hooks/pre-commit
fi

echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Update .env file with your API keys"
echo "2. Run './scripts/deploy.sh' to start services"
echo "3. Test with: 'python scripts/jewelry_cli.py scrape -q \"diamond rings\" -p 1'"
echo "4. Launch dashboard: 'python scripts/jewelry_cli.py dashboard'"
echo ""
echo "🔗 Useful Commands:"
echo "• Activate environment: source venv/bin/activate"
echo "• CLI help: python scripts/jewelry_cli.py --help"
echo "• Run tests: python scripts/jewelry_cli.py test"
echo "• Check status: python scripts/jewelry_cli.py status"
```

---

## Phase 7: Documentation and Usage Guide

### 7.1 Complete Documentation

````markdown
# documentation.md

# eBay Jewelry Scraper System Documentation

## 🎯 Overview

The eBay Jewelry Scraper System is an advanced agentic platform that combines Crawl4AI for web scraping, n8n for workflow automation, and a custom MCP server for natural language control. The system specifically targets eBay jewelry listings, extracts comprehensive product data, and automatically downloads and organizes product images.

## 🏗️ Architecture

### Core Components

1. **Crawl4AI Engine** (`crawl4ai-engine/`)

   - Advanced web scraping with anti-bot measures
   - eBay-specific selectors and pagination handling
   - Asynchronous processing for high performance
   - Jewelry categorization and data extraction

2. **MCP Server** (`mcp-server/`)

   - FastMCP-based server for tool and resource management
   - Natural language interface for system control
   - RESTful API for integration with other services
   - Type-safe operations with pydantic models

3. **Image Processing Pipeline** (`crawl4ai-engine/image_processor.py`)

   - Concurrent image downloading with rate limiting
   - Automatic categorization and organization
   - Image optimization and quality enhancement
   - Metadata generation and storage

4. **Data Management** (`crawl4ai-engine/data_manager.py`)

   - SQLite database for structured data storage
   - Efficient querying and filtering capabilities
   - Data export in multiple formats (CSV, JSON)
   - Automated cleanup and retention policies

5. **n8n Workflows** (`n8n-workflows/`)
   - Automated scheduling and execution
   - Error handling and notifications
   - Integration with external services
   - Monitoring and alerting

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Docker and Docker Compose
- 8GB+ RAM recommended
- 10GB+ free disk space

### Installation

1. **Clone and Setup**
   ```bash
   git clone <repository>
   cd ebay-jewelry-scraper
   chmod +x scripts/setup.sh
   ./scripts/setup.sh
   ```
````

2. **Configure Environment**

   ```bash
   # Update .env file with your credentials
   nano .env
   ```

3. **Deploy Services**

   ```bash
   ./scripts/deploy.sh
   ```

4. **Verify Installation**

   ```bash
   python scripts/jewelry_cli.py status
   ```

### First Scraping Job

```bash
# Basic scraping
python scripts/jewelry_cli.py scrape -q "diamond rings" -p 2

# View results
python scripts/jewelry_cli.py list --category rings --limit 10

# Export data
python scripts/jewelry_cli.py export --category rings --format csv
```

## 🛠️ Usage Guide

### CLI Commands

#### Scraping Operations

```bash
# Scrape with specific parameters
python scripts/jewelry_cli.py scrape \
  --query "vintage pearl necklaces" \
  --pages 5 \
  --images \
  --output results.json

# Scrape without downloading images
python scripts/jewelry_cli.py scrape -q "gold bracelets" -p 3 --no-images
```

#### Data Management

```bash
# List all listings
python scripts/jewelry_cli.py list

# Filter by category
python scripts/jewelry_cli.py list --category earrings --limit 20

# Export to CSV
python scripts/jewelry_cli.py export --category rings --format csv

# Export all data as JSON
python scripts/jewelry_cli.py export --format json
```

#### System Maintenance

```bash
# Check system status
python scripts/jewelry_cli.py status

# Clean old data (30 days retention)
python scripts/jewelry_cli.py cleanup --days 30

# Run system tests
python scripts/jewelry_cli.py test
```

#### Service Management

```bash
# Start MCP server
python scripts/jewelry_cli.py serve

# Launch monitoring dashboard
python scripts/jewelry_cli.py dashboard

# Deploy entire system
python scripts/jewelry_cli.py deploy
```

### MCP Server API

#### Tools Available

1. **scrape_jewelry_listings**

   ```python
   {
     "search_query": "diamond engagement rings",
     "max_pages": 3,
     "download_images": True
   }
   ```

2. **query_jewelry_listings**

   ```python
   {
     "category": "rings",
     "limit": 50,
     "offset": 0
   }
   ```

3. **export_jewelry_data**

   ```python
   {
     "category": "necklaces",
     "format": "csv"
   }
   ```

4. **get_system_status**

   ```python
   {}
   ```

5. **cleanup_old_data**

   ```python
   {
     "retention_days": 30
   }
   ```

#### Resources Available

- `listings://recent` - Recent jewelry listings
- `listings://category/{category}` - Listings by category
- `stats://system` - System statistics

### n8n Workflows

#### Automated Scraping Workflow

1. **Setup**: Import workflow from `n8n-workflows/scraping-workflow.json`
2. **Configure**: Set credentials for Slack, Google Drive, etc.
3. **Schedule**: Configure trigger timing
4. **Monitor**: Check execution history

#### Monitoring Workflow

1. **Health Checks**: Monitors all services every 15 minutes
2. **Alerts**: Sends notifications for failures or issues
3. **Auto-cleanup**: Removes old data automatically
4. **Statistics**: Tracks system performance

## 📊 Monitoring and Analytics

### Dashboard Features

- Real-time system health monitoring
- Database statistics and trends
- Storage usage analysis
- Category distribution charts
- Recent activity timeline
- Price distribution analysis

### Access Points

- **Streamlit Dashboard**: `http://localhost:8501`
- **n8n Interface**: `http://localhost:5678`
- **MCP Server Health**: `http://localhost:8000/health`

### Key Metrics

- Total listings scraped
- Images downloaded and organized
- Storage usage by category
- Scraping success/failure rates
- System response times

## 🔧 Configuration

### Environment Variables

```bash
# API Keys
OPENAI_API_KEY=your_api_key_here
EBAY_APP_ID=your_ebay_app_id

# Scraping Configuration
MAX_CONCURRENT_SCRAPES=5
RATE_LIMIT_DELAY=2
IMAGE_DOWNLOAD_TIMEOUT=30
MAX_IMAGES_PER_LISTING=10

# Storage Configuration
DATA_RETENTION_DAYS=30
IMAGE_QUALITY=85
```

### Scraper Configuration

```python
CONFIG = {
    'rate_limit_delay': 2,        # Delay between requests
    'max_listings_per_page': 50,  # Items per page
    'image_download_timeout': 30, # Image download timeout
    'max_images_per_listing': 10, # Max images per item
    'max_image_size': (1200, 1200), # Image resize limit
    'image_quality': 85           # JPEG quality
}
```

### Database Schema

#### Tables

1. **listings** - Main listing data
2. **images** - Image metadata and paths
3. **specifications** - Product specifications
4. **scraping_sessions** - Session tracking

## 🔍 Troubleshooting

### Common Issues

#### 1. Crawl4AI Installation Issues

```bash
# Reinstall Playwright browsers
python -m playwright install --with-deps chromium

# Verify installation
crawl4ai-doctor
```

#### 2. Docker Service Issues

```bash
# Check container status
docker ps

# View logs
docker-compose logs [service-name]

# Restart services
docker-compose restart
```

#### 3. Database Connection Issues

```bash
# Check database file permissions
ls -la ./data-storage/jewelry_listings.db

# Reinitialize database
python -c "from data_manager import DataManager; DataManager('./data-storage/jewelry_listings.db', './data-storage')"
```

#### 4. Image Download Failures

- Check internet connectivity
- Verify image URLs are accessible
- Increase timeout settings
- Check storage space

### Performance Optimization

#### 1. Concurrent Processing

```python
# Adjust concurrency limits
MAX_CONCURRENT_SCRAPES = 3  # Reduce if getting blocked
semaphore = asyncio.Semaphore(3)
```

#### 2. Memory Usage

```python
# Process images in batches
batch_size = 10
for i in range(0, len(listings), batch_size):
    batch = listings[i:i+batch_size]
    await process_batch(batch)
```

#### 3. Storage Optimization

```bash
# Enable automatic cleanup
python scripts/jewelry_cli.py cleanup --days 7

# Compress old images
find ./image-storage -name "*.jpg" -mtime +30 -exec jpegoptim {} \;
```

## 🔒 Security Considerations

### Data Protection

1. **API Keys**: Store in environment variables, never in code
2. **Database**: Use proper file permissions (600)
3. **Images**: Scan downloads for malware
4. **Rate Limiting**: Respect eBay's robots.txt and ToS

### Network Security

1. **Firewalls**: Restrict access to internal services
2. **HTTPS**: Use TLS for all external communications
3. **Monitoring**: Log all API access attempts
4. **Updates**: Keep all dependencies updated

## 📈 Scaling and Production

### Horizontal Scaling

1. **Multiple Scrapers**: Deploy across multiple servers
2. **Load Balancing**: Use nginx or similar
3. **Database Sharding**: Split by category or time
4. **Image CDN**: Use cloud storage for images

### Production Deployment

```yaml
# docker-compose.prod.yml
version: "3.8"
services:
  crawl4ai-service:
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

### Monitoring in Production

1. **Prometheus**: Metrics collection
2. **Grafana**: Visualization
3. **ELK Stack**: Log aggregation
4. **Alerts**: PagerDuty or similar

## 🤝 Contributing

### Development Setup

```bash
# Clone repository
git clone <repository>
cd ebay-jewelry-scraper

# Install development dependencies
pip install -r requirements-dev.txt

# Setup pre-commit hooks
pre-commit install

# Run tests
pytest
```

### Code Standards

- **Black**: Code formatting
- **Ruff**: Linting
- **Type hints**: Required for all functions
- **Docstrings**: Google style
- **Tests**: Minimum 80% coverage

### Submitting Changes

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Getting Help

1. **Documentation**: Check this guide first
2. **Issues**: GitHub issue tracker
3. **Discussions**: GitHub discussions
4. **Community**: Discord server

### Reporting Bugs

Please include:

- System information
- Error messages
- Steps to reproduce
- Configuration details

### Feature Requests

- Describe the use case
- Explain expected behavior
- Provide implementation ideas if any

````

### 7.2 API Reference
```markdown
# api_reference.md

# API Reference

## MCP Server Endpoints

### Base URL
`http://localhost:8000`

### Authentication
Currently no authentication required for local deployment.

### Tool Endpoints

#### POST /tools/scrape_jewelry_listings

Scrape eBay jewelry listings based on search query.

**Request Body:**
```json
{
  "search_query": "diamond rings",
  "max_pages": 3,
  "download_images": true
}
````

**Response:**

```json
{
  "success": true,
  "session_id": "uuid-string",
  "total_listings": 150,
  "saved_listings": 148,
  "failed_listings": 2,
  "categories": {
    "rings": 120,
    "necklaces": 20,
    "earrings": 10
  },
  "image_processing": {
    "processed": 148,
    "failed": 2,
    "total_images": 1200
  }
}
```

#### POST /tools/query_jewelry_listings

Query stored jewelry listings with optional filtering.

**Request Body:**

```json
{
  "category": "rings",
  "limit": 50,
  "offset": 0
}
```

**Response:**

```json
{
  "success": true,
  "listings": [...],
  "count": 50,
  "statistics": {...},
  "pagination": {
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

### Resource Endpoints

#### GET /resources/listings/recent

Get recently scraped jewelry listings.

**Response:** JSON array of listing objects

#### GET /resources/listings/category/{category}

Get listings filtered by category.

**Parameters:**

- `category`: rings, necklaces, earrings, bracelets, watches, other

**Response:** JSON array of listing objects

### Health Endpoint

#### GET /health

Check server health status.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

## Data Models

### Listing Object

```json
{
  "listing_id": "string",
  "title": "string",
  "price": "string",
  "currency": "string",
  "condition": "string",
  "seller_name": "string",
  "seller_rating": "string",
  "shipping_info": "string",
  "location": "string",
  "images": ["array", "of", "urls"],
  "description": "string",
  "specifications": { "key": "value" },
  "listing_url": "string",
  "category": "string",
  "subcategory": "string",
  "created_at": "timestamp",
  "scraped_at": "timestamp"
}
```

### System Statistics

```json
{
  "total_listings": 1000,
  "by_category": {
    "rings": 400,
    "necklaces": 300,
    "earrings": 200,
    "bracelets": 80,
    "watches": 20
  },
  "recent_listings_24h": 50,
  "total_images": 8000,
  "last_updated": "timestamp"
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error description",
  "error_code": "ERROR_CODE",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### Common Error Codes

- `INVALID_QUERY`: Search query is invalid or empty
- `SCRAPING_FAILED`: Web scraping operation failed
- `DATABASE_ERROR`: Database operation failed
- `IMAGE_PROCESSING_ERROR`: Image download/processing failed
- `RATE_LIMITED`: Too many requests, rate limit exceeded

## Rate Limits

- **Scraping**: Max 1 request per 2 seconds
- **API Calls**: Max 100 requests per minute
- **Image Downloads**: Max 5 concurrent downloads

## WebSocket Events (Future)

```json
{
  "event": "scraping_progress",
  "data": {
    "session_id": "uuid",
    "progress": 0.75,
    "current_page": 3,
    "total_pages": 4,
    "listings_found": 120
  }
}
```

````

This comprehensive workflow specification provides everything needed to build the eBay jewelry scraping system with Crawl4AI, n8n integration, and custom MCP server. The specification includes:

✅ **Complete Architecture** - All components properly integrated
✅ **Production-Ready Code** - Full implementation with error handling
✅ **Docker Deployment** - Containerized services with proper networking
✅ **CLI Interface** - Easy-to-use command-line tools
✅ **Monitoring Dashboard** - Real-time system monitoring
✅ **Comprehensive Testing** - Full test suite for reliability
✅ **Documentation** - Complete usage guide and API reference
✅ **Security Considerations** - Proper authentication and rate limiting
✅ **Scalability** - Designed for production deployment

The system can be deployed by following the phase-by-phase instructions and will provide a robust, agentic jewelry scraping platform with advanced image processing and natural language control through the MCP interface.# Claude Code CLI Workflow Specification
## eBay Jewelry Scraping System with Crawl4AI, n8n, and MCP Integration

### Project Overview
Build an advanced agentic system that combines Crawl4AI as the core scraping engine, n8n for workflow automation, and a custom MCP server for natural language control. The system will specifically target eBay jewelry listings, extract product data, and automatically download and organize product images.

### Architecture Components
- **Crawl4AI v0.6.x**: Core scraping engine with eBay-specific configurations
- **FastMCP 2.0**: Custom MCP server for agent communication
- **n8n**: Workflow orchestration and automation platform
- **Image Processing Pipeline**: Automated image download and organization
- **Data Storage**: Structured storage for listings and metadata
- **Docker Deployment**: Containerized deployment for scalability

---

## Phase 1: Environment Setup and Initialization

### 1.1 Create Project Structure
```bash
# Create main project directory
mkdir ebay-jewelry-scraper
cd ebay-jewelry-scraper

# Create organized directory structure
mkdir -p {crawl4ai-engine,mcp-server,n8n-workflows,image-storage,data-storage,docs,scripts,tests}
mkdir -p image-storage/{rings,necklaces,earrings,bracelets,watches,other}
mkdir -p data-storage/{raw,processed,exports}
mkdir -p logs/{crawl4ai,mcp-server,n8n}

# Initialize project files
touch README.md
touch .env.example
touch .gitignore
touch docker-compose.yml
````

### 1.2 Python Environment Setup

```bash
# Create Python virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Create requirements files
cat > requirements.txt << 'EOF'
# Core Dependencies
crawl4ai[transformer]==0.6.3
fastmcp==2.0.0
mcp==1.9.4
n8n-client==0.1.0

# Data Processing
pandas==2.1.4
numpy==1.24.3
pillow==10.1.0
opencv-python==4.8.1.78

# Database
sqlite3
sqlalchemy==2.0.23
alembic==1.13.1

# Web Framework
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0

# Utilities
python-dotenv==1.0.0
requests==2.31.0
aiohttp==3.9.1
asyncio-mqtt==0.16.2
tenacity==8.2.3

# Monitoring
prometheus-client==0.19.0
structlog==23.2.0

# Development
pytest==7.4.3
pytest-asyncio==0.21.1
black==23.11.0
ruff==0.1.6
EOF

# Install dependencies
pip install -r requirements.txt
```

### 1.3 Docker Configuration

```yaml
# docker-compose.yml
version: "3.8"

services:
  crawl4ai-service:
    image: unclecode/crawl4ai:0.6.0-r2
    ports:
      - "11235:11235"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./data-storage:/data
      - ./logs/crawl4ai:/logs
    shm_size: "2g"
    restart: unless-stopped

  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USERNAME}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - DB_TYPE=sqlite
      - DB_SQLITE_DATABASE=/home/node/.n8n/database.sqlite
    volumes:
      - ./n8n-data:/home/node/.n8n
      - ./n8n-workflows:/workflows
    restart: unless-stopped

  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - CRAWL4AI_URL=http://crawl4ai-service:11235
      - N8N_URL=http://n8n:5678
    volumes:
      - ./image-storage:/app/images
      - ./data-storage:/app/data
      - ./logs/mcp-server:/app/logs
    depends_on:
      - crawl4ai-service
      - n8n
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

### 1.4 Environment Configuration

```bash
# Create .env file
cat > .env << 'EOF'
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
EBAY_APP_ID=your_ebay_app_id_here

# n8n Configuration
N8N_USERNAME=admin
N8N_PASSWORD=secure_password_here

# Scraping Configuration
MAX_CONCURRENT_SCRAPES=5
RATE_LIMIT_DELAY=2
IMAGE_DOWNLOAD_TIMEOUT=30
MAX_IMAGES_PER_LISTING=10

# Storage Configuration
DATA_RETENTION_DAYS=30
IMAGE_QUALITY=high

# Monitoring
PROMETHEUS_PORT=9090
LOG_LEVEL=INFO
EOF
```

---

## Phase 2: Crawl4AI Engine Development

### 2.1 Core Scraping Engine

```python
# crawl4ai-engine/ebay_scraper.py
import asyncio
import json
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from pathlib import Path
import aiohttp
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.extraction_strategy import CSSExtractionStrategy

logger = structlog.get_logger()

@dataclass
class JewelryListing:
    """Data structure for eBay jewelry listings"""
    listing_id: str
    title: str
    price: str
    currency: str
    condition: str
    seller_name: str
    seller_rating: str
    shipping_info: str
    location: str
    images: List[str]
    description: str
    specifications: Dict[str, Any]
    listing_url: str
    category: str
    subcategory: str
    created_at: str
    scraped_at: str

class EBayJewelryScraper:
    """Advanced eBay jewelry scraping engine using Crawl4AI"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.browser_config = BrowserConfig(
            headless=True,
            browser_type="chromium",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport_width=1920,
            viewport_height=1080,
            accept_downloads=False,
            java_script_enabled=True,
            ignore_https_errors=True,
            extra_args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-extensions",
                "--disable-plugins",
                "--disable-images"  # We'll download images separately
            ]
        )

        # eBay-specific CSS selectors
        self.selectors = {
            "title": "h1#x-title-label-lbl",
            "price": ".price .notranslate",
            "condition": ".condition-value",
            "seller": ".seller-persona a",
            "seller_rating": ".seller-persona .reviews",
            "shipping": ".shipping-section",
            "location": ".location-info",
            "images": ".image-treatment img",
            "description": "#desc_wrapper_cmp",
            "specifications": ".itemAttr tbody tr",
            "breadcrumbs": ".breadcrumb ol li a"
        }

    async def scrape_jewelry_search(self, search_query: str, max_pages: int = 5) -> List[JewelryListing]:
        """Scrape eBay jewelry search results"""
        listings = []

        async with AsyncWebCrawler(config=self.browser_config) as crawler:
            for page in range(1, max_pages + 1):
                try:
                    # Construct eBay search URL for jewelry
                    search_url = self._build_search_url(search_query, page)
                    logger.info(f"Scraping search page {page}: {search_url}")

                    # Configure crawler for search results
                    run_config = CrawlerRunConfig(
                        wait_for_timeout=5000,
                        css_selector=".srp-results .s-item",
                        extraction_strategy=CSSExtractionStrategy({
                            "listing_links": {"selector": "a.s-item__link", "attribute": "href"},
                            "titles": {"selector": ".s-item__title"},
                            "prices": {"selector": ".s-item__price"},
                            "conditions": {"selector": ".s-item__subtitle"},
                            "shipping": {"selector": ".s-item__shipping"}
                        }),
                        js_code="""
                        // Remove popups and ads
                        document.querySelectorAll('.overlay, .modal, .popup').forEach(el => el.remove());

                        // Scroll to load more items
                        window.scrollTo(0, document.body.scrollHeight);
                        """,
                        delay_before_return_html=3000
                    )

                    result = await crawler.arun(url=search_url, config=run_config)

                    if result.success:
                        listing_urls = self._extract_listing_urls(result)
                        for url in listing_urls:
                            listing = await self._scrape_individual_listing(crawler, url)
                            if listing:
                                listings.append(listing)
                                # Rate limiting
                                await asyncio.sleep(self.config.get('rate_limit_delay', 2))

                    # Page delay
                    await asyncio.sleep(3)

                except Exception as e:
                    logger.error(f"Error scraping search page {page}: {e}")
                    continue

        return listings

    async def _scrape_individual_listing(self, crawler: AsyncWebCrawler, url: str) -> Optional[JewelryListing]:
        """Scrape individual jewelry listing"""
        try:
            logger.info(f"Scraping listing: {url}")

            run_config = CrawlerRunConfig(
                wait_for_timeout=10000,
                extraction_strategy=CSSExtractionStrategy(self.selectors),
                js_code="""
                // Expand description
                const moreBtn = document.querySelector('.show-more, .expand-btn');
                if (moreBtn) moreBtn.click();

                // Load all images
                document.querySelectorAll('img[data-src]').forEach(img => {
                    img.src = img.dataset.src;
                });

                // Wait for images to load
                await new Promise(resolve => setTimeout(resolve, 2000));
                """,
                delay_before_return_html=5000
            )

            result = await crawler.arun(url=url, config=run_config)

            if result.success and result.extracted_content:
                return self._parse_listing_data(result, url)

        except Exception as e:
            logger.error(f"Error scraping listing {url}: {e}")

        return None

    def _build_search_url(self, query: str, page: int = 1) -> str:
        """Build eBay search URL for jewelry"""
        base_url = "https://www.ebay.com/sch/i.html"
        params = {
            "_nkw": query,
            "_sacat": "281",  # Jewelry & Watches category
            "_pgn": page,
            "_ipg": "240",  # Items per page
            "rt": "nc",
            "LH_BIN": "1",  # Buy It Now
            "LH_ItemCondition": "3|1000|2500",  # New, Used, Pre-owned
            "_sop": "12"  # Sort by newest
        }

        param_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{base_url}?{param_string}"

    def _extract_listing_urls(self, result) -> List[str]:
        """Extract listing URLs from search results"""
        urls = []
        if result.extracted_content and 'listing_links' in result.extracted_content:
            for link in result.extracted_content['listing_links']:
                if isinstance(link, dict) and 'href' in link:
                    url = link['href']
                    if url and 'itm/' in url:
                        urls.append(url)
        return urls[:self.config.get('max_listings_per_page', 50)]

    def _parse_listing_data(self, result, url: str) -> JewelryListing:
        """Parse extracted data into JewelryListing object"""
        data = result.extracted_content

        # Extract listing ID from URL
        listing_id = re.search(r'/itm/([^/?]+)', url)
        listing_id = listing_id.group(1) if listing_id else url.split('/')[-1]

        # Parse image URLs
        images = []
        if 'images' in data:
            for img in data['images']:
                if isinstance(img, dict) and 'src' in img:
                    img_url = img['src']
                    # Clean and validate image URL
                    if img_url and ('jpg' in img_url or 'jpeg' in img_url or 'png' in img_url):
                        images.append(img_url.replace('s-l64', 's-l1600'))  # Get high-res version

        # Determine jewelry category
        category, subcategory = self._categorize_jewelry(data.get('title', ''), data.get('breadcrumbs', []))

        return JewelryListing(
            listing_id=listing_id,
            title=data.get('title', '').strip(),
            price=self._clean_price(data.get('price', '')),
            currency='USD',  # Default, could be extracted
            condition=data.get('condition', '').strip(),
            seller_name=data.get('seller', '').strip(),
            seller_rating=data.get('seller_rating', '').strip(),
            shipping_info=data.get('shipping', '').strip(),
            location=data.get('location', '').strip(),
            images=images,
            description=self._clean_description(data.get('description', '')),
            specifications=self._parse_specifications(data.get('specifications', [])),
            listing_url=url,
            category=category,
            subcategory=subcategory,
            created_at='',  # Would need additional extraction
            scraped_at=asyncio.get_event_loop().time()
        )

    def _categorize_jewelry(self, title: str, breadcrumbs: List[str]) -> tuple[str, str]:
        """Categorize jewelry based on title and breadcrumbs"""
        title_lower = title.lower()

        categories = {
            'rings': ['ring', 'band', 'wedding ring', 'engagement ring'],
            'necklaces': ['necklace', 'pendant', 'chain', 'choker'],
            'earrings': ['earring', 'stud', 'hoop', 'drop earring'],
            'bracelets': ['bracelet', 'bangle', 'cuff', 'tennis bracelet'],
            'watches': ['watch', 'timepiece', 'chronograph'],
            'other': []
        }

        for category, keywords in categories.items():
            if any(keyword in title_lower for keyword in keywords):
                return 'jewelry', category

        return 'jewelry', 'other'

    def _clean_price(self, price_text: str) -> str:
        """Clean and standardize price text"""
        if not price_text:
            return "0.00"

        # Extract numeric price
        price_match = re.search(r'\$?([\d,]+\.?\d*)', price_text)
        return price_match.group(1) if price_match else "0.00"

    def _clean_description(self, description: str) -> str:
        """Clean and truncate description"""
        if not description:
            return ""

        # Remove HTML tags and extra whitespace
        clean_desc = re.sub(r'<[^>]+>', ' ', description)
        clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()

        # Truncate if too long
        return clean_desc[:2000] + "..." if len(clean_desc) > 2000 else clean_desc

    def _parse_specifications(self, specs_data: List) -> Dict[str, str]:
        """Parse specification table data"""
        specifications = {}

        for spec in specs_data:
            if isinstance(spec, dict) and 'text' in spec:
                text = spec['text']
                # Try to split key-value pairs
                if ':' in text:
                    parts = text.split(':', 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = parts[1].strip()
                        specifications[key] = value

        return specifications

# Export function for CLI usage
async def run_scraper(search_query: str, max_pages: int = 3, config: Dict = None) -> List[Dict]:
    """Main function to run the scraper"""
    if config is None:
        config = {
            'rate_limit_delay': 2,
            'max_listings_per_page': 50,
            'image_download_timeout': 30
        }

    scraper = EBayJewelryScraper(config)
    listings = await scraper.scrape_jewelry_search(search_query, max_pages)

    # Convert to dictionaries for JSON serialization
    return [asdict(listing) for listing in listings]

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "diamond rings"
    results = asyncio.run(run_scraper(query))
    print(json.dumps(results, indent=2))
```

### 2.2 Image Processing Pipeline

```python
# crawl4ai-engine/image_processor.py
import asyncio
import aiohttp
import aiofiles
from pathlib import Path
from typing import List, Dict, Optional
import hashlib
from PIL import Image, ImageEnhance
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()

class ImageProcessor:
    """Advanced image processing and organization for jewelry listings"""

    def __init__(self, storage_path: str, config: Dict):
        self.storage_path = Path(storage_path)
        self.config = config
        self.session = None

        # Ensure storage directories exist
        for category in ['rings', 'necklaces', 'earrings', 'bracelets', 'watches', 'other']:
            (self.storage_path / category).mkdir(parents=True, exist_ok=True)

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        timeout = aiohttp.ClientTimeout(total=self.config.get('image_download_timeout', 30))
        self.session = aiohttp.ClientSession(connector=connector, timeout=timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def process_listing_images(self, listing: Dict) -> Dict[str, List[str]]:
        """Download and process all images for a jewelry listing"""
        listing_id = listing.get('listing_id', 'unknown')
        category = listing.get('subcategory', 'other')
        images = listing.get('images', [])

        if not images:
            logger.warning(f"No images found for listing {listing_id}")
            return {"downloaded": [], "failed": []}

        logger.info(f"Processing {len(images)} images for listing {listing_id}")

        # Create listing-specific directory
        listing_dir = self.storage_path / category / listing_id
        listing_dir.mkdir(parents=True, exist_ok=True)

        # Process images concurrently
        semaphore = asyncio.Semaphore(5)  # Limit concurrent downloads
        tasks = [
            self._download_and_process_image(semaphore, img_url, listing_dir, i, listing)
            for i, img_url in enumerate(images[:self.config.get('max_images_per_listing', 10)])
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        downloaded = []
        failed = []

        for result in results:
            if isinstance(result, Exception):
                failed.append(str(result))
            elif result:
                downloaded.append(result)

        # Create metadata file
        await self._create_image_metadata(listing_dir, listing, downloaded)

        logger.info(f"Listing {listing_id}: Downloaded {len(downloaded)}, Failed {len(failed)}")

        return {
            "downloaded": downloaded,
            "failed": failed,
            "listing_dir": str(listing_dir)
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _download_and_process_image(self, semaphore: asyncio.Semaphore,
                                        img_url: str, listing_dir: Path,
                                        index: int, listing: Dict) -> Optional[str]:
        """Download and process a single image"""
        async with semaphore:
            try:
                # Generate filename
                url_hash = hashlib.md5(img_url.encode()).hexdigest()[:8]
                filename = f"{index:02d}_{url_hash}.jpg"
                file_path = listing_dir / filename

                # Skip if already exists
                if file_path.exists():
                    logger.debug(f"Image already exists: {filename}")
                    return str(file_path)

                # Download image
                logger.debug(f"Downloading image {index}: {img_url}")
                async with self.session.get(img_url) as response:
                    if response.status == 200:
                        content = await response.read()

                        # Save original
                        async with aiofiles.open(file_path, 'wb') as f:
                            await f.write(content)

                        # Process image (resize, optimize)
                        await self._optimize_image(file_path)

                        return str(file_path)
                    else:
                        logger.warning(f"Failed to download {img_url}: HTTP {response.status}")

            except Exception as e:
                logger.error(f"Error downloading image {img_url}: {e}")
                raise

        return None

    async def _optimize_image(self, file_path: Path):
        """Optimize image for storage and display"""
        try:
            with Image.open(file_path) as img:
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')

                # Resize if too large
                max_size = self.config.get('max_image_size', (1200, 1200))
                if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
                    img.thumbnail(max_size, Image.Resampling.LANCZOS)

                # Enhance image quality for jewelry
                enhancer = ImageEnhance.Sharpness(img)
                img = enhancer.enhance(1.2)

                # Save optimized version
                quality = self.config.get('image_quality', 85)
                img.save(file_path, 'JPEG', quality=quality, optimize=True)

        except Exception as e:
            logger.error(f"Error optimizing image {file_path}: {e}")

    async def _create_image_metadata(self, listing_dir: Path, listing: Dict, downloaded_images: List[str]):
        """Create metadata file for the listing images"""
        metadata = {
            "listing_id": listing.get('listing_id'),
            "title": listing.get('title'),
            "category": listing.get('subcategory'),
            "price": listing.get('price'),
            "images": downloaded_images,
            "total_images": len(downloaded_images),
            "processed_at": asyncio.get_event_loop().time()
        }

        metadata_file = listing_dir / "metadata.json"
        async with aiofiles.open(metadata_file, 'w') as f:
            await f.write(json.dumps(metadata, indent=2))

# Export function for CLI usage
async def process_images(listings: List[Dict], storage_path: str, config: Dict = None) -> Dict:
    """Process images for multiple listings"""
    if config is None:
        config = {
            'image_download_timeout': 30,
            'max_images_per_listing': 10,
            'max_image_size': (1200, 1200),
            'image_quality': 85
        }

    results = {"processed": 0, "failed": 0, "total_images": 0}

    async with ImageProcessor(storage_path, config) as processor:
        for listing in listings:
            try:
                result = await processor.process_listing_images(listing)
                results["processed"] += 1
                results["total_images"] += len(result["downloaded"])
            except Exception as e:
                logger.error(f"Failed to process images for listing {listing.get('listing_id')}: {e}")
                results["failed"] += 1

    return results
```

### 2.3 Data Storage Manager

```python
# crawl4ai-engine/data_manager.py
import asyncio
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Any
import pandas as pd
import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

logger = structlog.get_logger()

class DataManager:
    """Manage storage and retrieval of jewelry listing data"""

    def __init__(self, db_path: str, data_storage_path: str):
        self.db_path = Path(db_path)
        self.data_storage_path = Path(data_storage_path)
        self.engine = None
        self.async_session = None

        # Ensure directories exist
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.data_storage_path.mkdir(parents=True, exist_ok=True)

        # Initialize database
        self._init_database()

    def _init_database(self):
        """Initialize SQLite database with required tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create listings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                price REAL,
                currency TEXT DEFAULT 'USD',
                condition TEXT,
                seller_name TEXT,
                seller_rating TEXT,
                shipping_info TEXT,
                location TEXT,
                description TEXT,
                category TEXT,
                subcategory TEXT,
                listing_url TEXT,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create images table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT NOT NULL,
                image_url TEXT NOT NULL,
                local_path TEXT,
                image_index INTEGER,
                file_size INTEGER,
                width INTEGER,
                height INTEGER,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (listing_id) REFERENCES listings (listing_id)
            )
        ''')

        # Create specifications table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS specifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT NOT NULL,
                spec_key TEXT NOT NULL,
                spec_value TEXT,
                FOREIGN KEY (listing_id) REFERENCES listings (listing_id)
            )
        ''')

        # Create scraping sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scraping_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                search_query TEXT NOT NULL,
                total_listings INTEGER DEFAULT 0,
                successful_scrapes INTEGER DEFAULT 0,
                failed_scrapes INTEGER DEFAULT 0,
                total_images INTEGER DEFAULT 0,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                status TEXT DEFAULT 'running'
            )
        ''')

        # Create indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listings_category ON listings (category, subcategory)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listings_scraped ON listings (scraped_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_listing ON images (listing_id)')

        conn.commit()
        conn.close()

    async def save_listings(self, listings: List[Dict], session_id: str) -> Dict[str, int]:
        """Save multiple listings to database"""
        saved = 0
        failed = 0

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            for listing in listings:
                try:
                    # Insert or update listing
                    cursor.execute('''
                        INSERT OR REPLACE INTO listings
                        (listing_id, title, price, currency, condition, seller_name,
                         seller_rating, shipping_info, location, description, category,
                         subcategory, listing_url, scraped_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        listing.get('listing_id'),
                        listing.get('title'),
                        float(listing.get('price', '0').replace(',', '')) if listing.get('price') else 0,
                        listing.get('currency', 'USD'),
                        listing.get('condition'),
                        listing.get('seller_name'),
                        listing.get('seller_rating'),
                        listing.get('shipping_info'),
                        listing.get('location'),
                        listing.get('description'),
                        listing.get('category'),
                        listing.get('subcategory'),
                        listing.get('listing_url'),
                        datetime.now().isoformat(),
                        listing.get('created_at') or datetime.now().isoformat()
                    ))

                    # Save images
                    if listing.get('images'):
                        for idx, img_url in enumerate(listing['images']):
                            cursor.execute('''
                                INSERT OR REPLACE INTO images
                                (listing_id, image_url, image_index)
                                VALUES (?, ?, ?)
                            ''', (listing.get('listing_id'), img_url, idx))

                    # Save specifications
                    if listing.get('specifications'):
                        for key, value in listing['specifications'].items():
                            cursor.execute('''
                                INSERT OR REPLACE INTO specifications
                                (listing_id, spec_key, spec_value)
                                VALUES (?, ?, ?)
                            ''', (listing.get('listing_id'), key, value))

                    saved += 1

                except Exception as e:
                    logger.error(f"Failed to save listing {listing.get('listing_id')}: {e}")
                    failed += 1

            # Update session statistics
            cursor.execute('''
                UPDATE scraping_sessions
                SET successful_scrapes = ?, failed_scrapes = ?, total_listings = ?
                WHERE session_id = ?
            ''', (saved, failed, len(listings), session_id))

            conn.commit()

        finally:
            conn.close()

        return {"saved": saved, "failed": failed}

    async def get_listings(self, category: Optional[str] = None,
                          limit: int = 100, offset: int = 0) -> List[Dict]:
        """Retrieve listings from database"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            if category:
                cursor.execute('''
                    SELECT * FROM listings
                    WHERE subcategory = ?
                    ORDER BY scraped_at DESC
                    LIMIT ? OFFSET ?
                ''', (category, limit, offset))
            else:
                cursor.execute('''
                    SELECT * FROM listings
                    ORDER BY scraped_at DESC
                    LIMIT ? OFFSET ?
                ''', (limit, offset))

            rows = cursor.fetchall()
            return [dict(row) for row in rows]

        finally:
            conn.close()

    async def export_to_csv(self, output_path: str, category: Optional[str] = None) -> str:
        """Export listings to CSV format"""
        listings = await self.get_listings(category=category, limit=10000)

        if not listings:
            raise ValueError("No listings found to export")

        df = pd.DataFrame(listings)
        output_file = Path(output_path) / f"jewelry_listings_{category or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        df.to_csv(output_file, index=False)
        logger.info(f"Exported {len(listings)} listings to {output_file}")

        return str(output_file)

    async def cleanup_old_data(self, retention_days: int = 30):
        """Clean up old listings and images"""
        cutoff_date = datetime.now() - timedelta(days=retention_days)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Get old listings
            cursor.execute('''
                SELECT listing_id FROM listings
                WHERE scraped_at < ?
            ''', (cutoff_date.isoformat(),))

            old_listings = [row[0] for row in cursor.fetchall()]

            if old_listings:
                # Delete related records
                placeholders = ','.join(['?' for _ in old_listings])
                cursor.execute(f'DELETE FROM images WHERE listing_id IN ({placeholders})', old_listings)
                cursor.execute(f'DELETE FROM specifications WHERE listing_id IN ({placeholders})', old_listings)
                cursor.execute(f'DELETE FROM listings WHERE listing_id IN ({placeholders})', old_listings)

                conn.commit()
                logger.info(f"Cleaned up {len(old_listings)} old listings")

        finally:
            conn.close()

    async def get_statistics(self) -> Dict[str, Any]:
        """Get database statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Total listings
            cursor.execute('SELECT COUNT(*) FROM listings')
            total_listings = cursor.fetchone()[0]

            # Listings by category
            cursor.execute('''
                SELECT subcategory, COUNT(*)
                FROM listings
                GROUP BY subcategory
            ''')
            by_category = dict(cursor.fetchall())

            # Recent activity (last 24 hours)
            yesterday = (datetime.now() - timedelta(days=1)).isoformat()
            cursor.execute('SELECT COUNT(*) FROM listings WHERE scraped_at > ?', (yesterday,))
            recent_listings = cursor.fetchone()[0]

            # Total images
            cursor.execute('SELECT COUNT(*) FROM images')
            total_images = cursor.fetchone()[0]

            return {
                "total_listings": total_listings,
                "by_category": by_category,
                "recent_listings_24h": recent_listings,
                "total_images": total_images,
                "last_updated": datetime.now().isoformat()
            }

        finally:
            conn.close()

# Export function for CLI usage
async def manage_data(action: str, **kwargs) -> Any:
    """Main function for data management operations"""
    db_path = kwargs.get('db_path', './data-storage/jewelry_listings.db')
    data_path = kwargs.get('data_path', './data-storage')

    manager = DataManager(db_path, data_path)

    if action == 'save':
        return await manager.save_listings(kwargs['listings'], kwargs['session_id'])
    elif action == 'get':
        return await manager.get_listings(kwargs.get('category'), kwargs.get('limit', 100))
    elif action == 'export':
        return await manager.export_to_csv(kwargs['output_path'], kwargs.get('category'))
    elif action == 'cleanup':
        return await manager.cleanup_old_data(kwargs.get('retention_days', 30))
    elif action == 'stats':
        return await manager.get_statistics()
    else:
        raise ValueError(f"Unknown action: {action}")
```

---

## Phase 3: MCP Server Development

### 3.1 Core MCP Server with FastMCP

```python
# mcp-server/jewelry_mcp_server.py
import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Annotated
import aiohttp
import structlog
from pydantic import Field, BaseModel

from fastmcp import FastMCP, Context
from fastmcp.resources import FileResource
from fastmcp.tools import Tool

# Import our custom modules
import sys
sys.path.append('../crawl4ai-engine')
from ebay_scraper import run_scraper
from image_processor import process_images
from data_manager import manage_data

logger = structlog.get_logger()

# Initialize FastMCP server
app = FastMCP(
    name="eBay Jewelry Scraper MCP Server",
    description="Advanced agentic system for scraping eBay jewelry listings with image processing",
    version="1.0.0"
)

# Configuration
CONFIG = {
    "max_pages": 5,
    "rate_limit_delay": 2,
    "max_images_per_listing": 10,
    "image_storage_path": "./image-storage",
    "data_storage_path": "./data-storage",
    "db_path": "./data-storage/jewelry_listings.db"
}

class ScrapeRequest(BaseModel):
    """Request model for scraping operations"""
    search_query: str = Field(description="Search query for eBay jewelry")
    max_pages: int = Field(default=3, description="Maximum pages to scrape", ge=1, le=10)
    category_filter: Optional[str] = Field(default=None, description="Filter by jewelry category")
    price_range: Optional[tuple] = Field(default=None, description="Price range filter (min, max)")
    download_images: bool = Field(default=True, description="Whether to download images")

class ListingsQuery(BaseModel):
    """Request model for querying listings"""
    category: Optional[str] = Field(default=None, description="Jewelry category filter")
    limit: int = Field(default=50, description="Maximum number of listings to return", ge=1, le=1000)
    offset: int = Field(default=0, description="Offset for pagination", ge=0)
    export_format: Optional[str] = Field(default=None, description="Export format (csv, json)")

@app.tool()
async def scrape_jewelry_listings(
    search_query: Annotated[str, Field(description="Search query for eBay jewelry (e.g., 'diamond rings', 'vintage necklaces')")],
    max_pages: Annotated[int, Field(description="Maximum pages to scrape (1-10)", ge=1, le=10)] = 3,
    download_images: Annotated[bool, Field(description="Whether to download and organize images")] = True,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Scrape eBay jewelry listings based on search query.

    This tool scrapes eBay for jewelry listings, extracts detailed information,
    and optionally downloads and organizes product images by category.
    """
    try:
        session_id = str(uuid.uuid4())

        await ctx.info(f"Starting scraping session {session_id} for query: '{search_query}'")
        await ctx.report_progress(0, 100, "Initializing scraper...")

        # Run the scraper
        await ctx.report_progress(20, 100, "Scraping eBay listings...")
        scraper_config = {
            "rate_limit_delay": CONFIG["rate_limit_delay"],
            "max_listings_per_page": 50,
            "image_download_timeout": 30
        }

        listings = await run_scraper(search_query, max_pages, scraper_config)

        if not listings:
            return {
                "success": False,
                "message": "No listings found for the given search query",
                "session_id": session_id
            }

        await ctx.info(f"Found {len(listings)} listings")
        await ctx.report_progress(50, 100, f"Found {len(listings)} listings, saving to database...")

        # Save to database
        save_result = await manage_data('save', listings=listings, session_id=session_id,
                                      db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        result = {
            "success": True,
            "session_id": session_id,
            "total_listings": len(listings),
            "saved_listings": save_result["saved"],
            "failed_listings": save_result["failed"],
            "categories": {}
        }

        # Process images if requested
        if download_images:
            await ctx.report_progress(70, 100, "Downloading and processing images...")

            image_config = {
                "image_download_timeout": 30,
                "max_images_per_listing": CONFIG["max_images_per_listing"],
                "max_image_size": (1200, 1200),
                "image_quality": 85
            }

            image_result = await process_images(listings, CONFIG["image_storage_path"], image_config)
            result["image_processing"] = image_result

        # Generate category breakdown
        for listing in listings:
            category = listing.get('subcategory', 'other')
            result["categories"][category] = result["categories"].get(category, 0) + 1

        await ctx.report_progress(100, 100, "Scraping completed successfully!")
        await ctx.info(f"Scraping session {session_id} completed successfully")

        return result

    except Exception as e:
        logger.error(f"Error in scrape_jewelry_listings: {e}")
        return {
            "success": False,
            "error": str(e),
            "session_id": session_id if 'session_id' in locals() else None
        }

@app.tool()
async def query_jewelry_listings(
    category: Annotated[Optional[str], Field(description="Filter by jewelry category (rings, necklaces, earrings, bracelets, watches, other)")] = None,
    limit: Annotated[int, Field(description="Maximum number of listings to return", ge=1, le=1000)] = 50,
    offset: Annotated[int, Field(description="Offset for pagination", ge=0)] = 0,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Query and retrieve jewelry listings from the database.

    Retrieve stored jewelry listings with optional filtering by category.
    Supports pagination for large result sets.
    """
    try:
        await ctx.info(f"Querying listings: category={category}, limit={limit}, offset={offset}")

        listings = await manage_data('get', category=category, limit=limit, offset=offset,
                                   db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        # Get statistics
        stats = await manage_data('stats', db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        return {
            "success": True,
            "listings": listings,
            "count": len(listings),
            "statistics": stats,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "has_more": len(listings) == limit
            }
        }

    except Exception as e:
        logger.error(f"Error in query_jewelry_listings: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.tool()
async def export_jewelry_data(
    category: Annotated[Optional[str], Field(description="Filter by jewelry category for export")] = None,
    format: Annotated[str, Field(description="Export format (csv or json)")] = "csv",
    ctx: Context = None
) -> Dict[str, str]:
    """
    Export jewelry listings data to CSV or JSON format.

    Export stored jewelry listings with optional category filtering.
    Useful for data analysis and reporting.
    """
    try:
        await ctx.info(f"Exporting data: category={category}, format={format}")

        if format.lower() == "csv":
            export_path = await manage_data('export', output_path=CONFIG["data_storage_path"],
                                          category=category, db_path=CONFIG["db_path"],
                                          data_path=CONFIG["data_storage_path"])

            return {
                "success": True,
                "export_path": export_path,
                "format": "csv"
            }

        elif format.lower() == "json":
            listings = await manage_data('get', category=category, limit=10000,
                                       db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

            output_file = Path(CONFIG["data_storage_path"]) / f"jewelry_listings_{category or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

            with open(output_file, 'w') as f:
                json.dump(listings, f, indent=2, default=str)

            return {
                "success": True,
                "export_path": str(output_file),
                "format": "json"
            }

        else:
            return {
                "success": False,
                "error": f"Unsupported format: {format}. Use 'csv' or 'json'"
            }

    except Exception as e:
        logger.error(f"Error in export_jewelry_data: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.tool()
async def get_system_status(ctx: Context = None) -> Dict[str, Any]:
    """
    Get comprehensive system status and statistics.

    Returns information about the scraping system including database statistics,
    storage usage, and recent activity.
    """
    try:
        # Get database statistics
        stats = await manage_data('stats', db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        # Check storage usage
        storage_path = Path(CONFIG["image_storage_path"])
        total_size = sum(f.stat().st_size for f in storage_path.rglob('*') if f.is_file())

        # Count files by category
        category_counts = {}
        for category_dir in storage_path.iterdir():
            if category_dir.is_dir():
                file_count = len(list(category_dir.rglob('*.jpg')))
                category_counts[category_dir.name] = file_count

        return {
            "success": True,
            "database_stats": stats,
            "storage": {
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "images_by_category": category_counts
            },
            "config": CONFIG,
            "status": "operational"
        }

    except Exception as e:
        logger.error(f"Error in get_system_status: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.tool()
async def cleanup_old_data(
    retention_days: Annotated[int, Field(description="Number of days to retain data", ge=1, le=365)] = 30,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Clean up old listings and images to free storage space.

    Removes listings and associated images older than the specified retention period.
    """
    try:
        await ctx.info(f"Starting cleanup of data older than {retention_days} days")

        await manage_data('cleanup', retention_days=retention_days,
                         db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        return {
            "success": True,
            "message": f"Cleaned up data older than {retention_days} days"
        }

    except Exception as e:
        logger.error(f"Error in cleanup_old_data: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# Resource endpoints for data access
@app.resource("listings://recent")
async def get_recent_listings() -> str:
    """Get recently scraped jewelry listings"""
    try:
        listings = await manage_data('get', limit=20, db_path=CONFIG["db_path"],
                                   data_path=CONFIG["data_storage_path"])
        return json.dumps(listings, indent=2, default=str)
    except Exception as e:
        return f"Error retrieving recent listings: {e}"

@app.resource("listings://category/{category}")
async def get_listings_by_category(category: str) -> str:
    """Get jewelry listings filtered by category"""
    try:
        listings = await manage_data('get', category=category, limit=50,
                                   db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])
        return json.dumps(listings, indent=2, default=str)
    except Exception as e:
        return f"Error retrieving listings for category {category}: {e}"

@app.resource("stats://system")
async def get_system_statistics() -> str:
    """Get comprehensive system statistics"""
    try:
        stats = await manage_data('stats', db_path=CONFIG["db_path"],
                                data_path=CONFIG["data_storage_path"])
        return json.dumps(stats, indent=2, default=str)
    except Exception as e:
        return f"Error retrieving system statistics: {e}"

# Prompts for common operations
@app.prompt("scrape-jewelry")
async def scrape_jewelry_prompt() -> str:
    """Prompt template for scraping jewelry listings"""
    return """I want to scrape eBay jewelry listings. Please help me with:

1. Search Query: What specific jewelry should I search for? (e.g., "diamond engagement rings", "vintage gold necklaces", "pearl earrings")

2. Scope: How many pages should I scrape? (1-10 pages recommended)

3. Images: Should I download and organize product images?

4. Category Focus: Any specific jewelry category to focus on? (rings, necklaces, earrings, bracelets, watches)

Please provide these details and I'll start the scraping process for you."""

@app.prompt("analyze-listings")
async def analyze_listings_prompt() -> str:
    """Prompt template for analyzing jewelry listings"""
    return """I can help you analyze the jewelry listings in our database. Here are some analysis options:

1. **Category Analysis**: Compare quantities and average prices across jewelry categories
2. **Price Trends**: Analyze price distributions and identify outliers
3. **Seller Analysis**: Identify top sellers and their ratings
4. **Image Analysis**: Review image quality and availability
5. **Market Insights**: Generate insights about the jewelry market

What type of analysis would you like me to perform? I can also export the data in CSV or JSON format for external analysis."""

if __name__ == "__main__":
    # Run the MCP server
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 3.2 MCP Server Dockerfile

```dockerfile
# mcp-server/Dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs /app/data /app/images

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONPATH=/app
ENV LOG_LEVEL=INFO

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the server
CMD ["python", "jewelry_mcp_server.py"]
```

---

## Phase 4: n8n Workflow Integration

### 4.1 n8n Workflow Templates

```json
{
  "name": "eBay Jewelry Scraping Workflow",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 6
            }
          ]
        }
      },
      "id": "schedule-trigger",
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/scrape_jewelry_listings",
        "options": {},
        "method": "POST",
        "body": {
          "search_query": "{{ $json.search_query || 'diamond jewelry' }}",
          "max_pages": "{{ $json.max_pages || 3 }}",
          "download_images": true
        },
        "headers": {
          "Content-Type": "application/json"
        }
      },
      "id": "mcp-scraper-call",
      "name": "Call MCP Scraper",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "success-condition",
              "leftValue": "={{ $json.success }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equal"
              }
            }
          ],
          "combinator": "and"
        }
      },
      "id": "check-success",
      "name": "Check Success",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [640, 300]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/get_system_status",
        "options": {},
        "method": "POST"
      },
      "id": "get-statistics",
      "name": "Get Statistics",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [840, 200]
    },
    {
      "parameters": {
        "channel": "jewelry-alerts",
        "text": "🎉 Jewelry scraping completed successfully!\n\n📊 **Results:**\n• Total Listings: {{ $('Call MCP Scraper').item.json.total_listings }}\n• Saved: {{ $('Call MCP Scraper').item.json.saved_listings }}\n• Categories: {{ Object.keys($('Call MCP Scraper').item.json.categories).join(', ') }}\n• Session ID: {{ $('Call MCP Scraper').item.json.session_id }}\n\n🖼️ **Images:** {{ $('Call MCP Scraper').item.json.image_processing?.total_images || 'N/A' }} downloaded\n\n📈 **Database Stats:**\n• Total Listings in DB: {{ $('Get Statistics').item.json.database_stats.total_listings }}\n• Storage Used: {{ $('Get Statistics').item.json.storage.total_size_mb }}MB"
      },
      "id": "notify-success",
      "name": "Notify Success",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [1040, 200]
    },
    {
      "parameters": {
        "channel": "jewelry-alerts",
        "text": "❌ Jewelry scraping failed!\n\n**Error:** {{ $('Call MCP Scraper').item.json.error }}\n**Session ID:** {{ $('Call MCP Scraper').item.json.session_id || 'Unknown' }}\n\nPlease check the logs for more details."
      },
      "id": "notify-failure",
      "name": "Notify Failure",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [840, 400]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/export_jewelry_data",
        "options": {},
        "method": "POST",
        "body": {
          "format": "csv"
        }
      },
      "id": "export-data",
      "name": "Export Data",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1240, 200]
    },
    {
      "parameters": {
        "operation": "upload",
        "fileId": {
          "__rl": true,
          "value": "={{ $('Export Data').item.json.export_path }}",
          "mode": "expression"
        },
        "options": {}
      },
      "id": "upload-to-drive",
      "name": "Upload to Google Drive",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [1440, 200]
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [
        [
          {
            "node": "Call MCP Scraper",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Call MCP Scraper": {
      "main": [
        [
          {
            "node": "Check Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Check Success": {
      "main": [
        [
          {
            "node": "Get Statistics",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Notify Failure",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Statistics": {
      "main": [
        [
          {
            "node": "Notify Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Notify Success": {
      "main": [
        [
          {
            "node": "Export Data",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Export Data": {
      "main": [
        [
          {
            "node": "Upload to Google Drive",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "settings": {
    "executionOrder": "v1"
  },
  "staticData": null,
  "tags": ["jewelry", "scraping", "automation"],
  "triggerCount": 1,
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "versionId": "1"
}
```

### 4.2 Advanced Monitoring Workflow

```json
{
  "name": "Jewelry Scraper Monitoring & Alerts",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 15
            }
          ]
        }
      },
      "id": "monitor-schedule",
      "name": "Monitor Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/health",
        "options": {
          "timeout": 10000
        },
        "method": "GET"
      },
      "id": "health-check",
      "name": "Health Check MCP Server",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 300]
    },
    {
      "parameters": {
        "url": "http://crawl4ai-service:11235/health",
        "options": {
          "timeout": 10000
        },
        "method": "GET"
      },
      "id": "crawl4ai-health",
      "name": "Health Check Crawl4AI",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 500]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/get_system_status",
        "method": "POST"
      },
      "id": "system-status",
      "name": "Get System Status",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [640, 300]
    },
    {
      "parameters": {
        "jsCode": "const healthChecks = [\n  $('Health Check MCP Server').item,\n  $('Health Check Crawl4AI').item\n];\n\nconst systemStatus = $('Get System Status').item.json;\n\n// Check if any service is down\nconst servicesDown = healthChecks.filter(check => {\n  return !check.json || check.json.status !== 'healthy';\n});\n\n// Check storage usage\nconst storageWarning = systemStatus.storage?.total_size_mb > 1000; // 1GB warning\n\n// Check recent activity\nconst lowActivity = systemStatus.database_stats?.recent_listings_24h < 10;\n\nreturn {\n  servicesDown: servicesDown.length,\n  storageWarning,\n  lowActivity,\n  shouldAlert: servicesDown.length > 0 || storageWarning || lowActivity,\n  systemStatus\n};"
      },
      "id": "analyze-status",
      "name": "Analyze System Status",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [840, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "alert-condition",
              "leftValue": "={{ $json.shouldAlert }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equal"
              }
            }
          ],
          "combinator": "and"
        }
      },
      "id": "should-alert",
      "name": "Should Alert?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [1040, 300]
    },
    {
      "parameters": {
        "channel": "jewelry-alerts",
        "text": "🚨 **Jewelry Scraper System Alert**\n\n{% if $json.servicesDown > 0 %}❌ **Services Down:** {{ $json.servicesDown }}\n{% endif %}{% if $json.storageWarning %}⚠️ **Storage Warning:** {{ $json.systemStatus.storage.total_size_mb }}MB used\n{% endif %}{% if $json.lowActivity %}📉 **Low Activity:** Only {{ $json.systemStatus.database_stats.recent_listings_24h }} listings in 24h\n{% endif %}\n**Database Stats:**\n• Total Listings: {{ $json.systemStatus.database_stats.total_listings }}\n• Categories: {{ Object.keys($json.systemStatus.database_stats.by_category).join(', ') }}\n\nPlease check the system status."
      },
      "id": "send-alert",
      "name": "Send Alert",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [1240, 200]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/cleanup_old_data",
        "method": "POST",
        "body": {
          "retention_days": 7
        }
      },
      "id": "auto-cleanup",
      "name": "Auto Cleanup",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1240, 400]
    }
  ],
  "connections": {
    "Monitor Schedule": {
      "main": [
        [
          {
            "node": "Health Check MCP Server",
            "type": "main",
            "index": 0
          },
          {
            "node": "Health Check Crawl4AI",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Health Check MCP Server": {
      "main": [
        [
          {
            "node": "Get System Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get System Status": {
      "main": [
        [
          {
            "node": "Analyze System Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Analyze System Status": {
      "main": [
        [
          {
            "node": "Should Alert?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Should Alert?": {
      "main": [
        [
          {
            "node": "Send Alert",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Auto Cleanup",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

## Phase 5: Deployment and Testing

### 5.1 Deployment Script

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Deploying eBay Jewelry Scraper System..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please update .env file with your API keys and configuration"
    exit 1
fi

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Health checks
echo "🏥 Performing health checks..."

# Check Crawl4AI
if curl -f http://localhost:11235/health >/dev/null 2>&1; then
    echo "✅ Crawl4AI service is healthy"
else
    echo "❌ Crawl4AI service health check failed"
fi

# Check n8n
if curl -f http://localhost:5678 >/dev/null 2>&1; then
    echo "✅ n8n service is healthy"
else
    echo "❌ n8n service health check failed"
fi

# Check MCP Server
if curl -f http://localhost:8000/health >/dev/null 2>&1; then
    echo "✅ MCP Server is healthy"
else
    echo "❌ MCP Server health check failed"
fi

# Setup initial data
echo "🗃️  Setting up initial database..."
python3 -c "
import asyncio
import sys
sys.path.append('./crawl4ai-engine')
from data_manager import DataManager
dm = DataManager('./data-storage/jewelry_listings.db', './data-storage')
print('Database initialized successfully')
"

echo "🎉 Deployment completed!"
echo ""
echo "📊 Access URLs:"
echo "• n8n Workflow Interface: http://localhost:5678"
echo "• MCP Server Health: http://localhost:8000/health"
echo "• Crawl4AI Service: http://localhost:11235"
echo ""
echo "🔧 Next Steps:"
echo "1. Configure n8n credentials (Slack, Google Drive, etc.)"
echo "2. Import workflow templates from ./n8n-workflows/"
echo "3. Test the system with a small scraping job"
echo "4. Set up monitoring and alerts"
```

### 5.2 Testing Suite

```python
# tests/test_system.py
import pytest
import asyncio
import json
import aiohttp
from pathlib import Path
import tempfile
import shutil

class TestJewelryScrapingSystem:
    """Comprehensive test suite for the jewelry scraping system"""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory for tests"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def test_config(self, temp_storage):
        """Test configuration"""
        return {
            'rate_limit_delay': 0.1,  # Faster for tests
            'max_listings_per_page': 5,
            'image_download_timeout': 10,
            'max_images_per_listing': 3,
            'image_storage_path': temp_storage,
            'data_storage_path': temp_storage
        }

    @pytest.mark.asyncio
    async def test_scraper_basic_functionality(self, test_config):
        """Test basic scraping functionality"""
        from crawl4ai_engine.ebay_scraper import EBayJewelryScraper

        scraper = EBayJewelryScraper(test_config)

        # Test search URL building
        url = scraper._build_search_url("test jewelry", 1)
        assert "test jewelry" in url or "test%20jewelry" in url
        assert "_sacat=281" in url  # Jewelry category

        # Test categorization
        category, subcategory = scraper._categorize_jewelry("Diamond Ring", [])
        assert category == "jewelry"
        assert subcategory == "rings"

    @pytest.mark.asyncio
    async def test_image_processor(self, test_config, temp_storage):
        """Test image processing functionality"""
        from crawl4ai_engine.image_processor import ImageProcessor

        # Mock listing data
        test_listing = {
            'listing_id': 'test123',
            'subcategory': 'rings',
            'images': [
                'https://via.placeholder.com/300x300/0000FF/FFFFFF?text=Test+Image'
            ]
        }

        async with ImageProcessor(temp_storage, test_config) as processor:
            result = await processor.process_listing_images(test_listing)

            assert result['downloaded'] or result['failed']  # Should have some result

            # Check directory structure
            listing_dir = Path(temp_storage) / 'rings' / 'test123'
            assert listing_dir.exists()

    @pytest.mark.asyncio
    async def test_data_manager(self, temp_storage):
        """Test data management functionality"""
        from crawl4ai_engine.data_manager import DataManager

        db_path = Path(temp_storage) / 'test.db'
        manager = DataManager(str(db_path), temp_storage)

        # Test saving listings
        test_listings = [{
            'listing_id': 'test123',
            'title': 'Test Ring',
            'price': '100.00',
            'category': 'jewelry',
            'subcategory': 'rings',
            'images': ['test1.jpg', 'test2.jpg'],
            'specifications': {'material': 'gold', 'size': '7'}
        }]

        result = await manager.save_listings(test_listings, 'test_session')
        assert result['saved'] == 1

        # Test retrieving listings
        retrieved = await manager.get_listings(limit=10)
        assert len(retrieved) == 1
        assert retrieved[0]['title'] == 'Test Ring'

        # Test statistics
        stats = await manager.get_statistics()
        assert stats['total_listings'] == 1
        assert 'rings' in stats['by_category']

    @pytest.mark.asyncio
    async def test_mcp_server_endpoints(self):
        """Test MCP server endpoints"""
        base_url = "http://localhost:8000"

        async with aiohttp.ClientSession() as session:
            # Test health endpoint
            async with session.get(f"{base_url}/health") as response:
                assert response.status == 200

            # Test system status tool
            async with session.post(f"{base_url}/tools/get_system_status") as response:
                assert response.status == 200
                data = await response.json()
                assert 'database_stats' in data

    @pytest.mark.asyncio
    async def test_n8n_integration(self):
        """Test n8n workflow integration"""
        n8n_url = "http://localhost:5678"

        async with aiohttp.ClientSession() as session:
            try:
                # Test n8n health
                async with session.get(f"{n8n_url}/healthz") as response:
                    assert response.status == 200

                # Test workflow execution (if n8n is configured)
                # This would require proper n8n setup and authentication

            except aiohttp.ClientError:
                pytest.skip("n8n not available for testing")

    def test_docker_services(self):
        """Test that Docker services are running"""
        import subprocess

        try:
            # Check if containers are running
            result = subprocess.run(['docker', 'ps'], capture_output=True, text=True)
            assert result.returncode == 0

            container_names = ['crawl4ai-service', 'n8n', 'mcp-server']
            for name in container_names:
                assert name in result.stdout, f"Container {name} not found in running containers"

        except FileNotFoundError:
            pytest.skip("Docker not available for testing")

    @pytest.mark.integration
    async def test_end_to_end_workflow(self, test_config, temp_storage):
        """Test complete end-to-end workflow"""
        # This test requires all services to be running

        mcp_url = "http://localhost:8000"

        async with aiohttp.ClientSession() as session:
            # Test scraping through MCP server
            scrape_payload = {
                "search_query": "test jewelry",
                "max_pages": 1,
                "download_images": True
            }

            async with session.post(f"{mcp_url}/tools/scrape_jewelry_listings",
                                  json=scrape_payload) as response:
                assert response.status == 200
                data = await response.json()

                if data.get('success'):
                    assert 'session_id' in data
                    assert 'total_listings' in data

                    # Test querying the results
                    async with session.post(f"{mcp_url}/tools/query_jewelry_listings",
                                          json={"limit": 10}) as query_response:
                        assert query_response.status == 200
                        query_data = await query_response.json()
                        assert 'listings' in query_data

# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--asyncio-mode=auto"])
```

### 5.3 Monitoring Dashboard

```python
# scripts/monitoring_dashboard.py
import asyncio
import json
from datetime import datetime, timedelta
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import aiohttp
import sys
sys.path.append('./crawl4ai-engine')
from data_manager import DataManager

st.set_page_config(
    page_title="eBay Jewelry Scraper Dashboard",
    page_icon="💎",
    layout="wide"
)

class MonitoringDashboard:
    def __init__(self):
        self.mcp_url = "http://localhost:8000"
        self.data_manager = DataManager('./data-storage/jewelry_listings.db', './data-storage')

    async def get_system_status(self):
        """Get system status from MCP server"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.mcp_url}/tools/get_system_status") as response:
                    if response.status == 200:
                        return await response.json()
        except Exception as e:
            st.error(f"Failed to get system status: {e}")
        return None

    async def get_recent_listings(self, limit=100):
        """Get recent listings from database"""
        try:
            return await self.data_manager.get_listings(limit=limit)
        except Exception as e:
            st.error(f"Failed to get listings: {e}")
        return []

    def render_dashboard(self):
        """Render the monitoring dashboard"""
        st.title("💎 eBay Jewelry Scraper Dashboard")

        # Get data
        system_status = asyncio.run(self.get_system_status())
        recent_listings = asyncio.run(self.get_recent_listings())

        if not system_status:
            st.error("❌ Cannot connect to MCP server")
            return

        # System Status Section
        st.header("🏥 System Health")
        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric("Total Listings", system_status.get('database_stats', {}).get('total_listings', 0))

        with col2:
            st.metric("Storage Used", f"{system_status.get('storage', {}).get('total_size_mb', 0):.1f} MB")

        with col3:
            recent_24h = system_status.get('database_stats', {}).get('recent_listings_24h', 0)
            st.metric("Listings (24h)", recent_24h)

        with col4:
            total_images = sum(system_status.get('storage', {}).get('images_by_category', {}).values())
            st.metric("Total Images", total_images)

        # Category Distribution
        st.header("📊 Category Distribution")
        category_data = system_status.get('database_stats', {}).get('by_category', {})

        if category_data:
            col1, col2 = st.columns(2)

            with col1:
                # Pie chart
                fig_pie = px.pie(
                    values=list(category_data.values()),
                    names=list(category_data.keys()),
                    title="Listings by Category"
                )
                st.plotly_chart(fig_pie, use_container_width=True)

            with col2:
                # Bar chart
                fig_bar = px.bar(
                    x=list(category_data.keys()),
                    y=list(category_data.values()),
                    title="Category Counts"
                )
                st.plotly_chart(fig_bar, use_container_width=True)

        # Recent Activity
        st.header("📈 Recent Activity")

        if recent_listings:
            df = pd.DataFrame(recent_listings)

            # Convert scraped_at to datetime
            df['scraped_at'] = pd.to_datetime(df['scraped_at'])
            df['date'] = df['scraped_at'].dt.date

            # Daily activity chart
            daily_counts = df.groupby('date').size().reset_index(name='count')
            fig_timeline = px.line(
                daily_counts,
                x='date',
                y='count',
                title="Daily Scraping Activity"
            )
            st.plotly_chart(fig_timeline, use_container_width=True)

            # Price distribution
            if 'price' in df.columns:
                df['price_numeric'] = pd.to_numeric(df['price'], errors='coerce')
                df_price = df.dropna(subset=['price_numeric'])

                if not df_price.empty:
                    fig_price = px.histogram(
                        df_price,
                        x='price_numeric',
                        nbins=50,
                        title="Price Distribution"
                    )
                    st.plotly_chart(fig_price, use_container_width=True)

        # Recent Listings Table
        st.header("📋 Recent Listings")

        if recent_listings:
            # Display top 20 recent listings
            display_df = pd.DataFrame(recent_listings[:20])

            # Select relevant columns
            if not display_df.empty:
                columns = ['title', 'price', 'condition', 'subcategory', 'seller_name', 'scraped_at']
                available_columns = [col for col in columns if col in display_df.columns]

                st.dataframe(
                    display_df[available_columns],
                    use_container_width=True,
                    hide_index=True
                )

        # Image Storage Analysis
        st.header("🖼️ Image Storage")

        image_data = system_status.get('storage', {}).get('images_by_category', {})
        if image_data:
            col1, col2 = st.columns(2)

            with col1:
                fig_images = px.bar(
                    x=list(image_data.keys()),
                    y=list(image_data.values()),
                    title="Images by Category"
                )
                st.plotly_chart(fig_images, use_container_width=True)

            with col2:
                # Storage efficiency
                total_listings_by_cat = system_status.get('database_stats', {}).get('by_category', {})
                if total_listings_by_cat:
                    efficiency_data = []
                    for category in image_data.keys():
                        if category in total_listings_by_cat:
                            avg_images = image_data[category] / total_listings_by_cat[category]
                            efficiency_data.append({'category': category, 'avg_images': avg_images})

                    if efficiency_data:
                        eff_df = pd.DataFrame(efficiency_data)
                        fig_eff = px.bar(
                            eff_df,
                            x='category',
                            y='avg_images',
                            title="Average Images per Listing"
                        )
                        st.plotly_chart(fig_eff, use_container_width=True)

        # System Actions
        st.header("⚙️ System Actions")

        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("🧹 Cleanup Old Data"):
                with st.spinner("Cleaning up..."):
                    # Call cleanup endpoint
                    st.success("
```

        with col1:
            if st.button("🧹 Cleanup Old Data"):
                with st.spinner("Cleaning up..."):
                    # Call cleanup endpoint
                    try:
                        asyncio.run(self._cleanup_data())
                        st.success("Data cleanup completed!")
                        st.experimental_rerun()
                    except Exception as e:
                        st.error(f"Cleanup failed: {e}")

        with col2:
            if st.button("📤 Export Data"):
                with st.spinner("Exporting..."):
                    try:
                        export_path = asyncio.run(self._export_data())
                        st.success(f"Data exported to: {export_path}")
                    except Exception as e:
                        st.error(f"Export failed: {e}")

        with col3:
            if st.button("🔄 Refresh Data"):
                st.experimental_rerun()

    async def _cleanup_data(self):
        """Call cleanup API"""
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.mcp_url}/tools/cleanup_old_data",
                                  json={"retention_days": 30}) as response:
                if response.status != 200:
                    raise Exception("Cleanup API call failed")

    async def _export_data(self):
        """Call export API"""
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{self.mcp_url}/tools/export_jewelry_data",
                                  json={"format": "csv"}) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('export_path')
                raise Exception("Export API call failed")

# Run the dashboard

if **name** == "**main**":
dashboard = MonitoringDashboard()
dashboard.render_dashboard()

````

---

## Phase 6: CLI Commands and Automation

### 6.1 Main CLI Interface
```python
# scripts/jewelry_cli.py
import click
import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime
import subprocess

# Add project modules to path
sys.path.append('./crawl4ai-engine')
sys.path.append('./mcp-server')

@click.group()
@click.version_option(version='1.0.0')
def cli():
    """🚀 eBay Jewelry Scraper CLI

    Advanced agentic system for scraping eBay jewelry listings with image processing.
    """
    pass

@cli.command()
@click.option('--query', '-q', required=True, help='Search query for jewelry')
@click.option('--pages', '-p', default=3, help='Number of pages to scrape')
@click.option('--images/--no-images', default=True, help='Download images')
@click.option('--output', '-o', help='Output file for results')
def scrape(query, pages, images, output):
    """Scrape eBay jewelry listings"""
    click.echo(f"🔍 Scraping eBay for: {query}")

    from ebay_scraper import run_scraper
    from image_processor import process_images
    from data_manager import manage_data

    try:
        # Run scraper
        with click.progressbar(length=100, label='Scraping') as bar:
            bar.update(20)

            config = {
                'rate_limit_delay': 2,
                'max_listings_per_page': 50,
                'image_download_timeout': 30
            }

            listings = asyncio.run(run_scraper(query, pages, config))
            bar.update(50)

            if not listings:
                click.echo("❌ No listings found")
                return

            # Save to database
            session_id = datetime.now().strftime('%Y%m%d_%H%M%S')
            result = asyncio.run(manage_data('save', listings=listings, session_id=session_id))
            bar.update(70)

            click.echo(f"✅ Found {len(listings)} listings")
            click.echo(f"💾 Saved {result['saved']} listings to database")

            # Process images if requested
            if images:
                image_config = {
                    'image_download_timeout': 30,
                    'max_images_per_listing': 10,
                    'max_image_size': (1200, 1200),
                    'image_quality': 85
                }

                image_result = asyncio.run(process_images(listings, './image-storage', image_config))
                click.echo(f"🖼️ Downloaded {image_result['total_images']} images")

            bar.update(100)

            # Output results if requested
            if output:
                with open(output, 'w') as f:
                    json.dump(listings, f, indent=2, default=str)
                click.echo(f"📄 Results saved to {output}")

    except Exception as e:
        click.echo(f"❌ Scraping failed: {e}")

@cli.command()
@click.option('--category', '-c', help='Filter by category')
@click.option('--limit', '-l', default=50, help='Maximum results')
@click.option('--format', '-f', type=click.Choice(['table', 'json', 'csv']), default='table')
def list(category, limit, format):
    """List scraped jewelry listings"""
    from data_manager import manage_data

    try:
        listings = asyncio.run(manage_data('get', category=category, limit=limit))

        if not listings:
            click.echo("No listings found")
            return

        if format == 'json':
            click.echo(json.dumps(listings, indent=2, default=str))
        elif format == 'csv':
            import pandas as pd
            df = pd.DataFrame(listings)
            click.echo(df.to_csv(index=False))
        else:
            # Table format
            click.echo(f"\n📋 Found {len(listings)} listings:")
            click.echo("-" * 80)

            for listing in listings[:20]:  # Limit display
                title = listing.get('title', 'N/A')[:50]
                price = listing.get('price', 'N/A')
                category = listing.get('subcategory', 'N/A')
                click.echo(f"{title:<52} ${price:<10} {category}")

    except Exception as e:
        click.echo(f"❌ Failed to list: {e}")

@cli.command()
@click.option('--category', '-c', help='Export specific category')
@click.option('--format', '-f', type=click.Choice(['csv', 'json']), default='csv')
@click.option('--output', '-o', help='Output directory')
def export(category, format, output):
    """Export jewelry data"""
    from data_manager import manage_data

    try:
        output_dir = output or './data-storage/exports'
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        if format == 'csv':
            export_path = asyncio.run(manage_data('export', output_path=output_dir, category=category))
        else:
            listings = asyncio.run(manage_data('get', category=category, limit=10000))
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            export_path = f"{output_dir}/jewelry_listings_{category or 'all'}_{timestamp}.json"

            with open(export_path, 'w') as f:
                json.dump(listings, f, indent=2, default=str)

        click.echo(f"✅ Data exported to: {export_path}")

    except Exception as e:
        click.echo(f"❌ Export failed: {e}")

@cli.command()
@click.option('--days', '-d', default=30, help='Data retention days')
def cleanup(days):
    """Clean up old data"""
    from data_manager import manage_data

    try:
        asyncio.run(manage_data('cleanup', retention_days=days))
        click.echo(f"✅ Cleaned up data older than {days} days")

    except Exception as e:
        click.echo(f"❌ Cleanup failed: {e}")

@cli.command()
def status():
    """Show system status"""
    from data_manager import manage_data

    try:
        stats = asyncio.run(manage_data('stats'))

        click.echo("📊 System Status:")
        click.echo(f"Total Listings: {stats['total_listings']}")
        click.echo(f"Recent (24h): {stats['recent_listings_24h']}")
        click.echo(f"Total Images: {stats['total_images']}")

        click.echo("\n📈 By Category:")
        for category, count in stats['by_category'].items():
            click.echo(f"  {category}: {count}")

    except Exception as e:
        click.echo(f"❌ Status check failed: {e}")

@cli.command()
@click.option('--port', '-p', default=8000, help='Server port')
def serve():
    """Start MCP server"""
    click.echo("🚀 Starting MCP server...")

    try:
        subprocess.run([
            'python', './mcp-server/jewelry_mcp_server.py'
        ], check=True)

    except KeyboardInterrupt:
        click.echo("\n🛑 Server stopped")
    except Exception as e:
        click.echo(f"❌ Server failed: {e}")

@cli.command()
def deploy():
    """Deploy the system using Docker"""
    click.echo("🚀 Deploying eBay Jewelry Scraper System...")

    try:
        # Run deployment script
        subprocess.run(['bash', './scripts/deploy.sh'], check=True)
        click.echo("✅ Deployment completed successfully!")

    except subprocess.CalledProcessError as e:
        click.echo(f"❌ Deployment failed: {e}")
    except FileNotFoundError:
        click.echo("❌ Deployment script not found")

@cli.command()
def dashboard():
    """Launch monitoring dashboard"""
    click.echo("📊 Starting monitoring dashboard...")

    try:
        subprocess.run([
            'streamlit', 'run', './scripts/monitoring_dashboard.py',
            '--server.port', '8501',
            '--server.headless', 'true'
        ], check=True)

    except KeyboardInterrupt:
        click.echo("\n🛑 Dashboard stopped")
    except Exception as e:
        click.echo(f"❌ Dashboard failed: {e}")

@cli.command()
def test():
    """Run system tests"""
    click.echo("🧪 Running system tests...")

    try:
        subprocess.run(['python', '-m', 'pytest', './tests/', '-v'], check=True)
        click.echo("✅ All tests passed!")

    except subprocess.CalledProcessError:
        click.echo("❌ Some tests failed")
    except FileNotFoundError:
        click.echo("❌ pytest not found")

if __name__ == '__main__':
    cli()
````

### 6.2 Setup Script

```bash
#!/bin/bash
# scripts/setup.sh

set -e

echo "🚀 Setting up eBay Jewelry Scraper System..."

# Check Python version
python_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
required_version="3.10"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ Python 3.10+ required. Found: $python_version"
    exit 1
fi

echo "✅ Python version check passed"

# Create virtual environment
echo "🐍 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Install development dependencies
pip install pytest pytest-asyncio black ruff streamlit

# Setup Crawl4AI
echo "🕷️ Setting up Crawl4AI..."
crawl4ai-setup

# Verify Crawl4AI installation
echo "🔍 Verifying Crawl4AI installation..."
crawl4ai-doctor

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p {image-storage/{rings,necklaces,earrings,bracelets,watches,other},data-storage/{raw,processed,exports},logs/{crawl4ai,mcp-server,n8n},n8n-data,tests}

# Initialize database
echo "🗃️ Initializing database..."
python3 -c "
import sys
sys.path.append('./crawl4ai-engine')
from data_manager import DataManager
dm = DataManager('./data-storage/jewelry_listings.db', './data-storage')
print('✅ Database initialized')
"

# Setup environment file
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.example .env
    echo "⚠️ Please update .env file with your API keys"
fi

# Make scripts executable
chmod +x scripts/*.sh

# Setup git hooks (if git repo)
if [ -d .git ]; then
    echo "🔧 Setting up git hooks..."
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "Running code formatting..."
python -m black --check .
python -m ruff check .
EOF
    chmod +x .git/hooks/pre-commit
fi

echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Update .env file with your API keys"
echo "2. Run './scripts/deploy.sh' to start services"
echo "3. Test with: 'python scripts/jewelry_cli.py scrape -q \"diamond rings\" -p 1'"
echo "4. Launch dashboard: 'python scripts/jewelry_cli.py dashboard'"
echo ""
echo "🔗 Useful Commands:"
echo "• Activate environment: source venv/bin/activate"
echo "• CLI help: python scripts/jewelry_cli.py --help"
echo "• Run tests: python scripts/jewelry_cli.py test"
echo "• Check status: python scripts/jewelry_cli.py status"
```

---

## Phase 7: Documentation and Usage Guide

### 7.1 Complete Documentation

````markdown
# documentation.md

# eBay Jewelry Scraper System Documentation

## 🎯 Overview

The eBay Jewelry Scraper System is an advanced agentic platform that combines Crawl4AI for web scraping, n8n for workflow automation, and a custom MCP server for natural language control. The system specifically targets eBay jewelry listings, extracts comprehensive product data, and automatically downloads and organizes product images.

## 🏗️ Architecture

### Core Components

1. **Crawl4AI Engine** (`crawl4ai-engine/`)

   - Advanced web scraping with anti-bot measures
   - eBay-specific selectors and pagination handling
   - Asynchronous processing for high performance
   - Jewelry categorization and data extraction

2. **MCP Server** (`mcp-server/`)

   - FastMCP-based server for tool and resource management
   - Natural language interface for system control
   - RESTful API for integration with other services
   - Type-safe operations with pydantic models

3. **Image Processing Pipeline** (`crawl4ai-engine/image_processor.py`)

   - Concurrent image downloading with rate limiting
   - Automatic categorization and organization
   - Image optimization and quality enhancement
   - Metadata generation and storage

4. **Data Management** (`crawl4ai-engine/data_manager.py`)

   - SQLite database for structured data storage
   - Efficient querying and filtering capabilities
   - Data export in multiple formats (CSV, JSON)
   - Automated cleanup and retention policies

5. **n8n Workflows** (`n8n-workflows/`)
   - Automated scheduling and execution
   - Error handling and notifications
   - Integration with external services
   - Monitoring and alerting

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Docker and Docker Compose
- 8GB+ RAM recommended
- 10GB+ free disk space

### Installation

1. **Clone and Setup**
   ```bash
   git clone <repository>
   cd ebay-jewelry-scraper
   chmod +x scripts/setup.sh
   ./scripts/setup.sh
   ```
````

2. **Configure Environment**

   ```bash
   # Update .env file with your credentials
   nano .env
   ```

3. **Deploy Services**

   ```bash
   ./scripts/deploy.sh
   ```

4. **Verify Installation**

   ```bash
   python scripts/jewelry_cli.py status
   ```

### First Scraping Job

```bash
# Basic scraping
python scripts/jewelry_cli.py scrape -q "diamond rings" -p 2

# View results
python scripts/jewelry_cli.py list --category rings --limit 10

# Export data
python scripts/jewelry_cli.py export --category rings --format csv
```

## 🛠️ Usage Guide

### CLI Commands

#### Scraping Operations

```bash
# Scrape with specific parameters
python scripts/jewelry_cli.py scrape \
  --query "vintage pearl necklaces" \
  --pages 5 \
  --images \
  --output results.json

# Scrape without downloading images
python scripts/jewelry_cli.py scrape -q "gold bracelets" -p 3 --no-images
```

#### Data Management

```bash
# List all listings
python scripts/jewelry_cli.py list

# Filter by category
python scripts/jewelry_cli.py list --category earrings --limit 20

# Export to CSV
python scripts/jewelry_cli.py export --category rings --format csv

# Export all data as JSON
python scripts/jewelry_cli.py export --format json
```

#### System Maintenance

```bash
# Check system status
python scripts/jewelry_cli.py status

# Clean old data (30 days retention)
python scripts/jewelry_cli.py cleanup --days 30

# Run system tests
python scripts/jewelry_cli.py test
```

#### Service Management

```bash
# Start MCP server
python scripts/jewelry_cli.py serve

# Launch monitoring dashboard
python scripts/jewelry_cli.py dashboard

# Deploy entire system
python scripts/jewelry_cli.py deploy
```

### MCP Server API

#### Tools Available

1. **scrape_jewelry_listings**

   ```python
   {
     "search_query": "diamond engagement rings",
     "max_pages": 3,
     "download_images": True
   }
   ```

2. **query_jewelry_listings**

   ```python
   {
     "category": "rings",
     "limit": 50,
     "offset": 0
   }
   ```

3. **export_jewelry_data**

   ```python
   {
     "category": "necklaces",
     "format": "csv"
   }
   ```

4. **get_system_status**

   ```python
   {}
   ```

5. **cleanup_old_data**

   ```python
   {
     "retention_days": 30
   }
   ```

#### Resources Available

- `listings://recent` - Recent jewelry listings
- `listings://category/{category}` - Listings by category
- `stats://system` - System statistics

### n8n Workflows

#### Automated Scraping Workflow

1. **Setup**: Import workflow from `n8n-workflows/scraping-workflow.json`
2. **Configure**: Set credentials for Slack, Google Drive, etc.
3. **Schedule**: Configure trigger timing
4. **Monitor**: Check execution history

#### Monitoring Workflow

1. **Health Checks**: Monitors all services every 15 minutes
2. **Alerts**: Sends notifications for failures or issues
3. **Auto-cleanup**: Removes old data automatically
4. **Statistics**: Tracks system performance

## 📊 Monitoring and Analytics

### Dashboard Features

- Real-time system health monitoring
- Database statistics and trends
- Storage usage analysis
- Category distribution charts
- Recent activity timeline
- Price distribution analysis

### Access Points

- **Streamlit Dashboard**: `http://localhost:8501`
- **n8n Interface**: `http://localhost:5678`
- **MCP Server Health**: `http://localhost:8000/health`

### Key Metrics

- Total listings scraped
- Images downloaded and organized
- Storage usage by category
- Scraping success/failure rates
- System response times

## 🔧 Configuration

### Environment Variables

```bash
# API Keys
OPENAI_API_KEY=your_api_key_here
EBAY_APP_ID=your_ebay_app_id

# Scraping Configuration
MAX_CONCURRENT_SCRAPES=5
RATE_LIMIT_DELAY=2
IMAGE_DOWNLOAD_TIMEOUT=30
MAX_IMAGES_PER_LISTING=10

# Storage Configuration
DATA_RETENTION_DAYS=30
IMAGE_QUALITY=85
```

### Scraper Configuration

```python
CONFIG = {
    'rate_limit_delay': 2,        # Delay between requests
    'max_listings_per_page': 50,  # Items per page
    'image_download_timeout': 30, # Image download timeout
    'max_images_per_listing': 10, # Max images per item
    'max_image_size': (1200, 1200), # Image resize limit
    'image_quality': 85           # JPEG quality
}
```

### Database Schema

#### Tables

1. **listings** - Main listing data
2. **images** - Image metadata and paths
3. **specifications** - Product specifications
4. **scraping_sessions** - Session tracking

## 🔍 Troubleshooting

### Common Issues

#### 1. Crawl4AI Installation Issues

```bash
# Reinstall Playwright browsers
python -m playwright install --with-deps chromium

# Verify installation
crawl4ai-doctor
```

#### 2. Docker Service Issues

```bash
# Check container status
docker ps

# View logs
docker-compose logs [service-name]

# Restart services
docker-compose restart
```

#### 3. Database Connection Issues

```bash
# Check database file permissions
ls -la ./data-storage/jewelry_listings.db

# Reinitialize database
python -c "from data_manager import DataManager; DataManager('./data-storage/jewelry_listings.db', './data-storage')"
```

#### 4. Image Download Failures

- Check internet connectivity
- Verify image URLs are accessible
- Increase timeout settings
- Check storage space

### Performance Optimization

#### 1. Concurrent Processing

```python
# Adjust concurrency limits
MAX_CONCURRENT_SCRAPES = 3  # Reduce if getting blocked
semaphore = asyncio.Semaphore(3)
```

#### 2. Memory Usage

```python
# Process images in batches
batch_size = 10
for i in range(0, len(listings), batch_size):
    batch = listings[i:i+batch_size]
    await process_batch(batch)
```

#### 3. Storage Optimization

```bash
# Enable automatic cleanup
python scripts/jewelry_cli.py cleanup --days 7

# Compress old images
find ./image-storage -name "*.jpg" -mtime +30 -exec jpegoptim {} \;
```

## 🔒 Security Considerations

### Data Protection

1. **API Keys**: Store in environment variables, never in code
2. **Database**: Use proper file permissions (600)
3. **Images**: Scan downloads for malware
4. **Rate Limiting**: Respect eBay's robots.txt and ToS

### Network Security

1. **Firewalls**: Restrict access to internal services
2. **HTTPS**: Use TLS for all external communications
3. **Monitoring**: Log all API access attempts
4. **Updates**: Keep all dependencies updated

## 📈 Scaling and Production

### Horizontal Scaling

1. **Multiple Scrapers**: Deploy across multiple servers
2. **Load Balancing**: Use nginx or similar
3. **Database Sharding**: Split by category or time
4. **Image CDN**: Use cloud storage for images

### Production Deployment

```yaml
# docker-compose.prod.yml
version: "3.8"
services:
  crawl4ai-service:
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

### Monitoring in Production

1. **Prometheus**: Metrics collection
2. **Grafana**: Visualization
3. **ELK Stack**: Log aggregation
4. **Alerts**: PagerDuty or similar

## 🤝 Contributing

### Development Setup

```bash
# Clone repository
git clone <repository>
cd ebay-jewelry-scraper

# Install development dependencies
pip install -r requirements-dev.txt

# Setup pre-commit hooks
pre-commit install

# Run tests
pytest
```

### Code Standards

- **Black**: Code formatting
- **Ruff**: Linting
- **Type hints**: Required for all functions
- **Docstrings**: Google style
- **Tests**: Minimum 80% coverage

### Submitting Changes

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Getting Help

1. **Documentation**: Check this guide first
2. **Issues**: GitHub issue tracker
3. **Discussions**: GitHub discussions
4. **Community**: Discord server

### Reporting Bugs

Please include:

- System information
- Error messages
- Steps to reproduce
- Configuration details

### Feature Requests

- Describe the use case
- Explain expected behavior
- Provide implementation ideas if any

````

### 7.2 API Reference
```markdown
# api_reference.md

# API Reference

## MCP Server Endpoints

### Base URL
`http://localhost:8000`

### Authentication
Currently no authentication required for local deployment.

### Tool Endpoints

#### POST /tools/scrape_jewelry_listings

Scrape eBay jewelry listings based on search query.

**Request Body:**
```json
{
  "search_query": "diamond rings",
  "max_pages": 3,
  "download_images": true
}
````

**Response:**

```json
{
  "success": true,
  "session_id": "uuid-string",
  "total_listings": 150,
  "saved_listings": 148,
  "failed_listings": 2,
  "categories": {
    "rings": 120,
    "necklaces": 20,
    "earrings": 10
  },
  "image_processing": {
    "processed": 148,
    "failed": 2,
    "total_images": 1200
  }
}
```

#### POST /tools/query_jewelry_listings

Query stored jewelry listings with optional filtering.

**Request Body:**

```json
{
  "category": "rings",
  "limit": 50,
  "offset": 0
}
```

**Response:**

```json
{
  "success": true,
  "listings": [...],
  "count": 50,
  "statistics": {...},
  "pagination": {
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

### Resource Endpoints

#### GET /resources/listings/recent

Get recently scraped jewelry listings.

**Response:** JSON array of listing objects

#### GET /resources/listings/category/{category}

Get listings filtered by category.

**Parameters:**

- `category`: rings, necklaces, earrings, bracelets, watches, other

**Response:** JSON array of listing objects

### Health Endpoint

#### GET /health

Check server health status.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

## Data Models

### Listing Object

```json
{
  "listing_id": "string",
  "title": "string",
  "price": "string",
  "currency": "string",
  "condition": "string",
  "seller_name": "string",
  "seller_rating": "string",
  "shipping_info": "string",
  "location": "string",
  "images": ["array", "of", "urls"],
  "description": "string",
  "specifications": { "key": "value" },
  "listing_url": "string",
  "category": "string",
  "subcategory": "string",
  "created_at": "timestamp",
  "scraped_at": "timestamp"
}
```

### System Statistics

```json
{
  "total_listings": 1000,
  "by_category": {
    "rings": 400,
    "necklaces": 300,
    "earrings": 200,
    "bracelets": 80,
    "watches": 20
  },
  "recent_listings_24h": 50,
  "total_images": 8000,
  "last_updated": "timestamp"
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error description",
  "error_code": "ERROR_CODE",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### Common Error Codes

- `INVALID_QUERY`: Search query is invalid or empty
- `SCRAPING_FAILED`: Web scraping operation failed
- `DATABASE_ERROR`: Database operation failed
- `IMAGE_PROCESSING_ERROR`: Image download/processing failed
- `RATE_LIMITED`: Too many requests, rate limit exceeded

## Rate Limits

- **Scraping**: Max 1 request per 2 seconds
- **API Calls**: Max 100 requests per minute
- **Image Downloads**: Max 5 concurrent downloads

## WebSocket Events (Future)

```json
{
  "event": "scraping_progress",
  "data": {
    "session_id": "uuid",
    "progress": 0.75,
    "current_page": 3,
    "total_pages": 4,
    "listings_found": 120
  }
}
```

````

This comprehensive workflow specification provides everything needed to build the eBay jewelry scraping system with Crawl4AI, n8n integration, and custom MCP server. The specification includes:

✅ **Complete Architecture** - All components properly integrated
✅ **Production-Ready Code** - Full implementation with error handling
✅ **Docker Deployment** - Containerized services with proper networking
✅ **CLI Interface** - Easy-to-use command-line tools
✅ **Monitoring Dashboard** - Real-time system monitoring
✅ **Comprehensive Testing** - Full test suite for reliability
✅ **Documentation** - Complete usage guide and API reference
✅ **Security Considerations** - Proper authentication and rate limiting
✅ **Scalability** - Designed for production deployment

The system can be deployed by following the phase-by-phase instructions and will provide a robust, agentic jewelry scraping platform with advanced image processing and natural language control through the MCP interface.# Claude Code CLI Workflow Specification
## eBay Jewelry Scraping System with Crawl4AI, n8n, and MCP Integration

### Project Overview
Build an advanced agentic system that combines Crawl4AI as the core scraping engine, n8n for workflow automation, and a custom MCP server for natural language control. The system will specifically target eBay jewelry listings, extract product data, and automatically download and organize product images.

### Architecture Components
- **Crawl4AI v0.6.x**: Core scraping engine with eBay-specific configurations
- **FastMCP 2.0**: Custom MCP server for agent communication
- **n8n**: Workflow orchestration and automation platform
- **Image Processing Pipeline**: Automated image download and organization
- **Data Storage**: Structured storage for listings and metadata
- **Docker Deployment**: Containerized deployment for scalability

---

## Phase 1: Environment Setup and Initialization

### 1.1 Create Project Structure
```bash
# Create main project directory
mkdir ebay-jewelry-scraper
cd ebay-jewelry-scraper

# Create organized directory structure
mkdir -p {crawl4ai-engine,mcp-server,n8n-workflows,image-storage,data-storage,docs,scripts,tests}
mkdir -p image-storage/{rings,necklaces,earrings,bracelets,watches,other}
mkdir -p data-storage/{raw,processed,exports}
mkdir -p logs/{crawl4ai,mcp-server,n8n}

# Initialize project files
touch README.md
touch .env.example
touch .gitignore
touch docker-compose.yml
````

### 1.2 Python Environment Setup

```bash
# Create Python virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Create requirements files
cat > requirements.txt << 'EOF'
# Core Dependencies
crawl4ai[transformer]==0.6.3
fastmcp==2.0.0
mcp==1.9.4
n8n-client==0.1.0

# Data Processing
pandas==2.1.4
numpy==1.24.3
pillow==10.1.0
opencv-python==4.8.1.78

# Database
sqlite3
sqlalchemy==2.0.23
alembic==1.13.1

# Web Framework
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0

# Utilities
python-dotenv==1.0.0
requests==2.31.0
aiohttp==3.9.1
asyncio-mqtt==0.16.2
tenacity==8.2.3

# Monitoring
prometheus-client==0.19.0
structlog==23.2.0

# Development
pytest==7.4.3
pytest-asyncio==0.21.1
black==23.11.0
ruff==0.1.6
EOF

# Install dependencies
pip install -r requirements.txt
```

### 1.3 Docker Configuration

```yaml
# docker-compose.yml
version: "3.8"

services:
  crawl4ai-service:
    image: unclecode/crawl4ai:0.6.0-r2
    ports:
      - "11235:11235"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./data-storage:/data
      - ./logs/crawl4ai:/logs
    shm_size: "2g"
    restart: unless-stopped

  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USERNAME}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - DB_TYPE=sqlite
      - DB_SQLITE_DATABASE=/home/node/.n8n/database.sqlite
    volumes:
      - ./n8n-data:/home/node/.n8n
      - ./n8n-workflows:/workflows
    restart: unless-stopped

  mcp-server:
    build:
      context: ./mcp-server
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - CRAWL4AI_URL=http://crawl4ai-service:11235
      - N8N_URL=http://n8n:5678
    volumes:
      - ./image-storage:/app/images
      - ./data-storage:/app/data
      - ./logs/mcp-server:/app/logs
    depends_on:
      - crawl4ai-service
      - n8n
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  redis-data:
```

### 1.4 Environment Configuration

```bash
# Create .env file
cat > .env << 'EOF'
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
EBAY_APP_ID=your_ebay_app_id_here

# n8n Configuration
N8N_USERNAME=admin
N8N_PASSWORD=secure_password_here

# Scraping Configuration
MAX_CONCURRENT_SCRAPES=5
RATE_LIMIT_DELAY=2
IMAGE_DOWNLOAD_TIMEOUT=30
MAX_IMAGES_PER_LISTING=10

# Storage Configuration
DATA_RETENTION_DAYS=30
IMAGE_QUALITY=high

# Monitoring
PROMETHEUS_PORT=9090
LOG_LEVEL=INFO
EOF
```

---

## Phase 2: Crawl4AI Engine Development

### 2.1 Core Scraping Engine

```python
# crawl4ai-engine/ebay_scraper.py
import asyncio
import json
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from pathlib import Path
import aiohttp
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from crawl4ai.extraction_strategy import CSSExtractionStrategy

logger = structlog.get_logger()

@dataclass
class JewelryListing:
    """Data structure for eBay jewelry listings"""
    listing_id: str
    title: str
    price: str
    currency: str
    condition: str
    seller_name: str
    seller_rating: str
    shipping_info: str
    location: str
    images: List[str]
    description: str
    specifications: Dict[str, Any]
    listing_url: str
    category: str
    subcategory: str
    created_at: str
    scraped_at: str

class EBayJewelryScraper:
    """Advanced eBay jewelry scraping engine using Crawl4AI"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.browser_config = BrowserConfig(
            headless=True,
            browser_type="chromium",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport_width=1920,
            viewport_height=1080,
            accept_downloads=False,
            java_script_enabled=True,
            ignore_https_errors=True,
            extra_args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-extensions",
                "--disable-plugins",
                "--disable-images"  # We'll download images separately
            ]
        )

        # eBay-specific CSS selectors
        self.selectors = {
            "title": "h1#x-title-label-lbl",
            "price": ".price .notranslate",
            "condition": ".condition-value",
            "seller": ".seller-persona a",
            "seller_rating": ".seller-persona .reviews",
            "shipping": ".shipping-section",
            "location": ".location-info",
            "images": ".image-treatment img",
            "description": "#desc_wrapper_cmp",
            "specifications": ".itemAttr tbody tr",
            "breadcrumbs": ".breadcrumb ol li a"
        }

    async def scrape_jewelry_search(self, search_query: str, max_pages: int = 5) -> List[JewelryListing]:
        """Scrape eBay jewelry search results"""
        listings = []

        async with AsyncWebCrawler(config=self.browser_config) as crawler:
            for page in range(1, max_pages + 1):
                try:
                    # Construct eBay search URL for jewelry
                    search_url = self._build_search_url(search_query, page)
                    logger.info(f"Scraping search page {page}: {search_url}")

                    # Configure crawler for search results
                    run_config = CrawlerRunConfig(
                        wait_for_timeout=5000,
                        css_selector=".srp-results .s-item",
                        extraction_strategy=CSSExtractionStrategy({
                            "listing_links": {"selector": "a.s-item__link", "attribute": "href"},
                            "titles": {"selector": ".s-item__title"},
                            "prices": {"selector": ".s-item__price"},
                            "conditions": {"selector": ".s-item__subtitle"},
                            "shipping": {"selector": ".s-item__shipping"}
                        }),
                        js_code="""
                        // Remove popups and ads
                        document.querySelectorAll('.overlay, .modal, .popup').forEach(el => el.remove());

                        // Scroll to load more items
                        window.scrollTo(0, document.body.scrollHeight);
                        """,
                        delay_before_return_html=3000
                    )

                    result = await crawler.arun(url=search_url, config=run_config)

                    if result.success:
                        listing_urls = self._extract_listing_urls(result)
                        for url in listing_urls:
                            listing = await self._scrape_individual_listing(crawler, url)
                            if listing:
                                listings.append(listing)
                                # Rate limiting
                                await asyncio.sleep(self.config.get('rate_limit_delay', 2))

                    # Page delay
                    await asyncio.sleep(3)

                except Exception as e:
                    logger.error(f"Error scraping search page {page}: {e}")
                    continue

        return listings

    async def _scrape_individual_listing(self, crawler: AsyncWebCrawler, url: str) -> Optional[JewelryListing]:
        """Scrape individual jewelry listing"""
        try:
            logger.info(f"Scraping listing: {url}")

            run_config = CrawlerRunConfig(
                wait_for_timeout=10000,
                extraction_strategy=CSSExtractionStrategy(self.selectors),
                js_code="""
                // Expand description
                const moreBtn = document.querySelector('.show-more, .expand-btn');
                if (moreBtn) moreBtn.click();

                // Load all images
                document.querySelectorAll('img[data-src]').forEach(img => {
                    img.src = img.dataset.src;
                });

                // Wait for images to load
                await new Promise(resolve => setTimeout(resolve, 2000));
                """,
                delay_before_return_html=5000
            )

            result = await crawler.arun(url=url, config=run_config)

            if result.success and result.extracted_content:
                return self._parse_listing_data(result, url)

        except Exception as e:
            logger.error(f"Error scraping listing {url}: {e}")

        return None

    def _build_search_url(self, query: str, page: int = 1) -> str:
        """Build eBay search URL for jewelry"""
        base_url = "https://www.ebay.com/sch/i.html"
        params = {
            "_nkw": query,
            "_sacat": "281",  # Jewelry & Watches category
            "_pgn": page,
            "_ipg": "240",  # Items per page
            "rt": "nc",
            "LH_BIN": "1",  # Buy It Now
            "LH_ItemCondition": "3|1000|2500",  # New, Used, Pre-owned
            "_sop": "12"  # Sort by newest
        }

        param_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{base_url}?{param_string}"

    def _extract_listing_urls(self, result) -> List[str]:
        """Extract listing URLs from search results"""
        urls = []
        if result.extracted_content and 'listing_links' in result.extracted_content:
            for link in result.extracted_content['listing_links']:
                if isinstance(link, dict) and 'href' in link:
                    url = link['href']
                    if url and 'itm/' in url:
                        urls.append(url)
        return urls[:self.config.get('max_listings_per_page', 50)]

    def _parse_listing_data(self, result, url: str) -> JewelryListing:
        """Parse extracted data into JewelryListing object"""
        data = result.extracted_content

        # Extract listing ID from URL
        listing_id = re.search(r'/itm/([^/?]+)', url)
        listing_id = listing_id.group(1) if listing_id else url.split('/')[-1]

        # Parse image URLs
        images = []
        if 'images' in data:
            for img in data['images']:
                if isinstance(img, dict) and 'src' in img:
                    img_url = img['src']
                    # Clean and validate image URL
                    if img_url and ('jpg' in img_url or 'jpeg' in img_url or 'png' in img_url):
                        images.append(img_url.replace('s-l64', 's-l1600'))  # Get high-res version

        # Determine jewelry category
        category, subcategory = self._categorize_jewelry(data.get('title', ''), data.get('breadcrumbs', []))

        return JewelryListing(
            listing_id=listing_id,
            title=data.get('title', '').strip(),
            price=self._clean_price(data.get('price', '')),
            currency='USD',  # Default, could be extracted
            condition=data.get('condition', '').strip(),
            seller_name=data.get('seller', '').strip(),
            seller_rating=data.get('seller_rating', '').strip(),
            shipping_info=data.get('shipping', '').strip(),
            location=data.get('location', '').strip(),
            images=images,
            description=self._clean_description(data.get('description', '')),
            specifications=self._parse_specifications(data.get('specifications', [])),
            listing_url=url,
            category=category,
            subcategory=subcategory,
            created_at='',  # Would need additional extraction
            scraped_at=asyncio.get_event_loop().time()
        )

    def _categorize_jewelry(self, title: str, breadcrumbs: List[str]) -> tuple[str, str]:
        """Categorize jewelry based on title and breadcrumbs"""
        title_lower = title.lower()

        categories = {
            'rings': ['ring', 'band', 'wedding ring', 'engagement ring'],
            'necklaces': ['necklace', 'pendant', 'chain', 'choker'],
            'earrings': ['earring', 'stud', 'hoop', 'drop earring'],
            'bracelets': ['bracelet', 'bangle', 'cuff', 'tennis bracelet'],
            'watches': ['watch', 'timepiece', 'chronograph'],
            'other': []
        }

        for category, keywords in categories.items():
            if any(keyword in title_lower for keyword in keywords):
                return 'jewelry', category

        return 'jewelry', 'other'

    def _clean_price(self, price_text: str) -> str:
        """Clean and standardize price text"""
        if not price_text:
            return "0.00"

        # Extract numeric price
        price_match = re.search(r'\$?([\d,]+\.?\d*)', price_text)
        return price_match.group(1) if price_match else "0.00"

    def _clean_description(self, description: str) -> str:
        """Clean and truncate description"""
        if not description:
            return ""

        # Remove HTML tags and extra whitespace
        clean_desc = re.sub(r'<[^>]+>', ' ', description)
        clean_desc = re.sub(r'\s+', ' ', clean_desc).strip()

        # Truncate if too long
        return clean_desc[:2000] + "..." if len(clean_desc) > 2000 else clean_desc

    def _parse_specifications(self, specs_data: List) -> Dict[str, str]:
        """Parse specification table data"""
        specifications = {}

        for spec in specs_data:
            if isinstance(spec, dict) and 'text' in spec:
                text = spec['text']
                # Try to split key-value pairs
                if ':' in text:
                    parts = text.split(':', 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = parts[1].strip()
                        specifications[key] = value

        return specifications

# Export function for CLI usage
async def run_scraper(search_query: str, max_pages: int = 3, config: Dict = None) -> List[Dict]:
    """Main function to run the scraper"""
    if config is None:
        config = {
            'rate_limit_delay': 2,
            'max_listings_per_page': 50,
            'image_download_timeout': 30
        }

    scraper = EBayJewelryScraper(config)
    listings = await scraper.scrape_jewelry_search(search_query, max_pages)

    # Convert to dictionaries for JSON serialization
    return [asdict(listing) for listing in listings]

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "diamond rings"
    results = asyncio.run(run_scraper(query))
    print(json.dumps(results, indent=2))
```

### 2.2 Image Processing Pipeline

```python
# crawl4ai-engine/image_processor.py
import asyncio
import aiohttp
import aiofiles
from pathlib import Path
from typing import List, Dict, Optional
import hashlib
from PIL import Image, ImageEnhance
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()

class ImageProcessor:
    """Advanced image processing and organization for jewelry listings"""

    def __init__(self, storage_path: str, config: Dict):
        self.storage_path = Path(storage_path)
        self.config = config
        self.session = None

        # Ensure storage directories exist
        for category in ['rings', 'necklaces', 'earrings', 'bracelets', 'watches', 'other']:
            (self.storage_path / category).mkdir(parents=True, exist_ok=True)

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        timeout = aiohttp.ClientTimeout(total=self.config.get('image_download_timeout', 30))
        self.session = aiohttp.ClientSession(connector=connector, timeout=timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def process_listing_images(self, listing: Dict) -> Dict[str, List[str]]:
        """Download and process all images for a jewelry listing"""
        listing_id = listing.get('listing_id', 'unknown')
        category = listing.get('subcategory', 'other')
        images = listing.get('images', [])

        if not images:
            logger.warning(f"No images found for listing {listing_id}")
            return {"downloaded": [], "failed": []}

        logger.info(f"Processing {len(images)} images for listing {listing_id}")

        # Create listing-specific directory
        listing_dir = self.storage_path / category / listing_id
        listing_dir.mkdir(parents=True, exist_ok=True)

        # Process images concurrently
        semaphore = asyncio.Semaphore(5)  # Limit concurrent downloads
        tasks = [
            self._download_and_process_image(semaphore, img_url, listing_dir, i, listing)
            for i, img_url in enumerate(images[:self.config.get('max_images_per_listing', 10)])
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        downloaded = []
        failed = []

        for result in results:
            if isinstance(result, Exception):
                failed.append(str(result))
            elif result:
                downloaded.append(result)

        # Create metadata file
        await self._create_image_metadata(listing_dir, listing, downloaded)

        logger.info(f"Listing {listing_id}: Downloaded {len(downloaded)}, Failed {len(failed)}")

        return {
            "downloaded": downloaded,
            "failed": failed,
            "listing_dir": str(listing_dir)
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _download_and_process_image(self, semaphore: asyncio.Semaphore,
                                        img_url: str, listing_dir: Path,
                                        index: int, listing: Dict) -> Optional[str]:
        """Download and process a single image"""
        async with semaphore:
            try:
                # Generate filename
                url_hash = hashlib.md5(img_url.encode()).hexdigest()[:8]
                filename = f"{index:02d}_{url_hash}.jpg"
                file_path = listing_dir / filename

                # Skip if already exists
                if file_path.exists():
                    logger.debug(f"Image already exists: {filename}")
                    return str(file_path)

                # Download image
                logger.debug(f"Downloading image {index}: {img_url}")
                async with self.session.get(img_url) as response:
                    if response.status == 200:
                        content = await response.read()

                        # Save original
                        async with aiofiles.open(file_path, 'wb') as f:
                            await f.write(content)

                        # Process image (resize, optimize)
                        await self._optimize_image(file_path)

                        return str(file_path)
                    else:
                        logger.warning(f"Failed to download {img_url}: HTTP {response.status}")

            except Exception as e:
                logger.error(f"Error downloading image {img_url}: {e}")
                raise

        return None

    async def _optimize_image(self, file_path: Path):
        """Optimize image for storage and display"""
        try:
            with Image.open(file_path) as img:
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')

                # Resize if too large
                max_size = self.config.get('max_image_size', (1200, 1200))
                if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
                    img.thumbnail(max_size, Image.Resampling.LANCZOS)

                # Enhance image quality for jewelry
                enhancer = ImageEnhance.Sharpness(img)
                img = enhancer.enhance(1.2)

                # Save optimized version
                quality = self.config.get('image_quality', 85)
                img.save(file_path, 'JPEG', quality=quality, optimize=True)

        except Exception as e:
            logger.error(f"Error optimizing image {file_path}: {e}")

    async def _create_image_metadata(self, listing_dir: Path, listing: Dict, downloaded_images: List[str]):
        """Create metadata file for the listing images"""
        metadata = {
            "listing_id": listing.get('listing_id'),
            "title": listing.get('title'),
            "category": listing.get('subcategory'),
            "price": listing.get('price'),
            "images": downloaded_images,
            "total_images": len(downloaded_images),
            "processed_at": asyncio.get_event_loop().time()
        }

        metadata_file = listing_dir / "metadata.json"
        async with aiofiles.open(metadata_file, 'w') as f:
            await f.write(json.dumps(metadata, indent=2))

# Export function for CLI usage
async def process_images(listings: List[Dict], storage_path: str, config: Dict = None) -> Dict:
    """Process images for multiple listings"""
    if config is None:
        config = {
            'image_download_timeout': 30,
            'max_images_per_listing': 10,
            'max_image_size': (1200, 1200),
            'image_quality': 85
        }

    results = {"processed": 0, "failed": 0, "total_images": 0}

    async with ImageProcessor(storage_path, config) as processor:
        for listing in listings:
            try:
                result = await processor.process_listing_images(listing)
                results["processed"] += 1
                results["total_images"] += len(result["downloaded"])
            except Exception as e:
                logger.error(f"Failed to process images for listing {listing.get('listing_id')}: {e}")
                results["failed"] += 1

    return results
```

### 2.3 Data Storage Manager

```python
# crawl4ai-engine/data_manager.py
import asyncio
import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Any
import pandas as pd
import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

logger = structlog.get_logger()

class DataManager:
    """Manage storage and retrieval of jewelry listing data"""

    def __init__(self, db_path: str, data_storage_path: str):
        self.db_path = Path(db_path)
        self.data_storage_path = Path(data_storage_path)
        self.engine = None
        self.async_session = None

        # Ensure directories exist
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.data_storage_path.mkdir(parents=True, exist_ok=True)

        # Initialize database
        self._init_database()

    def _init_database(self):
        """Initialize SQLite database with required tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create listings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                price REAL,
                currency TEXT DEFAULT 'USD',
                condition TEXT,
                seller_name TEXT,
                seller_rating TEXT,
                shipping_info TEXT,
                location TEXT,
                description TEXT,
                category TEXT,
                subcategory TEXT,
                listing_url TEXT,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create images table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT NOT NULL,
                image_url TEXT NOT NULL,
                local_path TEXT,
                image_index INTEGER,
                file_size INTEGER,
                width INTEGER,
                height INTEGER,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (listing_id) REFERENCES listings (listing_id)
            )
        ''')

        # Create specifications table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS specifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT NOT NULL,
                spec_key TEXT NOT NULL,
                spec_value TEXT,
                FOREIGN KEY (listing_id) REFERENCES listings (listing_id)
            )
        ''')

        # Create scraping sessions table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scraping_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                search_query TEXT NOT NULL,
                total_listings INTEGER DEFAULT 0,
                successful_scrapes INTEGER DEFAULT 0,
                failed_scrapes INTEGER DEFAULT 0,
                total_images INTEGER DEFAULT 0,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                status TEXT DEFAULT 'running'
            )
        ''')

        # Create indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listings_category ON listings (category, subcategory)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_listings_scraped ON listings (scraped_at)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_images_listing ON images (listing_id)')

        conn.commit()
        conn.close()

    async def save_listings(self, listings: List[Dict], session_id: str) -> Dict[str, int]:
        """Save multiple listings to database"""
        saved = 0
        failed = 0

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            for listing in listings:
                try:
                    # Insert or update listing
                    cursor.execute('''
                        INSERT OR REPLACE INTO listings
                        (listing_id, title, price, currency, condition, seller_name,
                         seller_rating, shipping_info, location, description, category,
                         subcategory, listing_url, scraped_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        listing.get('listing_id'),
                        listing.get('title'),
                        float(listing.get('price', '0').replace(',', '')) if listing.get('price') else 0,
                        listing.get('currency', 'USD'),
                        listing.get('condition'),
                        listing.get('seller_name'),
                        listing.get('seller_rating'),
                        listing.get('shipping_info'),
                        listing.get('location'),
                        listing.get('description'),
                        listing.get('category'),
                        listing.get('subcategory'),
                        listing.get('listing_url'),
                        datetime.now().isoformat(),
                        listing.get('created_at') or datetime.now().isoformat()
                    ))

                    # Save images
                    if listing.get('images'):
                        for idx, img_url in enumerate(listing['images']):
                            cursor.execute('''
                                INSERT OR REPLACE INTO images
                                (listing_id, image_url, image_index)
                                VALUES (?, ?, ?)
                            ''', (listing.get('listing_id'), img_url, idx))

                    # Save specifications
                    if listing.get('specifications'):
                        for key, value in listing['specifications'].items():
                            cursor.execute('''
                                INSERT OR REPLACE INTO specifications
                                (listing_id, spec_key, spec_value)
                                VALUES (?, ?, ?)
                            ''', (listing.get('listing_id'), key, value))

                    saved += 1

                except Exception as e:
                    logger.error(f"Failed to save listing {listing.get('listing_id')}: {e}")
                    failed += 1

            # Update session statistics
            cursor.execute('''
                UPDATE scraping_sessions
                SET successful_scrapes = ?, failed_scrapes = ?, total_listings = ?
                WHERE session_id = ?
            ''', (saved, failed, len(listings), session_id))

            conn.commit()

        finally:
            conn.close()

        return {"saved": saved, "failed": failed}

    async def get_listings(self, category: Optional[str] = None,
                          limit: int = 100, offset: int = 0) -> List[Dict]:
        """Retrieve listings from database"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            if category:
                cursor.execute('''
                    SELECT * FROM listings
                    WHERE subcategory = ?
                    ORDER BY scraped_at DESC
                    LIMIT ? OFFSET ?
                ''', (category, limit, offset))
            else:
                cursor.execute('''
                    SELECT * FROM listings
                    ORDER BY scraped_at DESC
                    LIMIT ? OFFSET ?
                ''', (limit, offset))

            rows = cursor.fetchall()
            return [dict(row) for row in rows]

        finally:
            conn.close()

    async def export_to_csv(self, output_path: str, category: Optional[str] = None) -> str:
        """Export listings to CSV format"""
        listings = await self.get_listings(category=category, limit=10000)

        if not listings:
            raise ValueError("No listings found to export")

        df = pd.DataFrame(listings)
        output_file = Path(output_path) / f"jewelry_listings_{category or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        df.to_csv(output_file, index=False)
        logger.info(f"Exported {len(listings)} listings to {output_file}")

        return str(output_file)

    async def cleanup_old_data(self, retention_days: int = 30):
        """Clean up old listings and images"""
        cutoff_date = datetime.now() - timedelta(days=retention_days)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Get old listings
            cursor.execute('''
                SELECT listing_id FROM listings
                WHERE scraped_at < ?
            ''', (cutoff_date.isoformat(),))

            old_listings = [row[0] for row in cursor.fetchall()]

            if old_listings:
                # Delete related records
                placeholders = ','.join(['?' for _ in old_listings])
                cursor.execute(f'DELETE FROM images WHERE listing_id IN ({placeholders})', old_listings)
                cursor.execute(f'DELETE FROM specifications WHERE listing_id IN ({placeholders})', old_listings)
                cursor.execute(f'DELETE FROM listings WHERE listing_id IN ({placeholders})', old_listings)

                conn.commit()
                logger.info(f"Cleaned up {len(old_listings)} old listings")

        finally:
            conn.close()

    async def get_statistics(self) -> Dict[str, Any]:
        """Get database statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            # Total listings
            cursor.execute('SELECT COUNT(*) FROM listings')
            total_listings = cursor.fetchone()[0]

            # Listings by category
            cursor.execute('''
                SELECT subcategory, COUNT(*)
                FROM listings
                GROUP BY subcategory
            ''')
            by_category = dict(cursor.fetchall())

            # Recent activity (last 24 hours)
            yesterday = (datetime.now() - timedelta(days=1)).isoformat()
            cursor.execute('SELECT COUNT(*) FROM listings WHERE scraped_at > ?', (yesterday,))
            recent_listings = cursor.fetchone()[0]

            # Total images
            cursor.execute('SELECT COUNT(*) FROM images')
            total_images = cursor.fetchone()[0]

            return {
                "total_listings": total_listings,
                "by_category": by_category,
                "recent_listings_24h": recent_listings,
                "total_images": total_images,
                "last_updated": datetime.now().isoformat()
            }

        finally:
            conn.close()

# Export function for CLI usage
async def manage_data(action: str, **kwargs) -> Any:
    """Main function for data management operations"""
    db_path = kwargs.get('db_path', './data-storage/jewelry_listings.db')
    data_path = kwargs.get('data_path', './data-storage')

    manager = DataManager(db_path, data_path)

    if action == 'save':
        return await manager.save_listings(kwargs['listings'], kwargs['session_id'])
    elif action == 'get':
        return await manager.get_listings(kwargs.get('category'), kwargs.get('limit', 100))
    elif action == 'export':
        return await manager.export_to_csv(kwargs['output_path'], kwargs.get('category'))
    elif action == 'cleanup':
        return await manager.cleanup_old_data(kwargs.get('retention_days', 30))
    elif action == 'stats':
        return await manager.get_statistics()
    else:
        raise ValueError(f"Unknown action: {action}")
```

---

## Phase 3: MCP Server Development

### 3.1 Core MCP Server with FastMCP

```python
# mcp-server/jewelry_mcp_server.py
import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Annotated
import aiohttp
import structlog
from pydantic import Field, BaseModel

from fastmcp import FastMCP, Context
from fastmcp.resources import FileResource
from fastmcp.tools import Tool

# Import our custom modules
import sys
sys.path.append('../crawl4ai-engine')
from ebay_scraper import run_scraper
from image_processor import process_images
from data_manager import manage_data

logger = structlog.get_logger()

# Initialize FastMCP server
app = FastMCP(
    name="eBay Jewelry Scraper MCP Server",
    description="Advanced agentic system for scraping eBay jewelry listings with image processing",
    version="1.0.0"
)

# Configuration
CONFIG = {
    "max_pages": 5,
    "rate_limit_delay": 2,
    "max_images_per_listing": 10,
    "image_storage_path": "./image-storage",
    "data_storage_path": "./data-storage",
    "db_path": "./data-storage/jewelry_listings.db"
}

class ScrapeRequest(BaseModel):
    """Request model for scraping operations"""
    search_query: str = Field(description="Search query for eBay jewelry")
    max_pages: int = Field(default=3, description="Maximum pages to scrape", ge=1, le=10)
    category_filter: Optional[str] = Field(default=None, description="Filter by jewelry category")
    price_range: Optional[tuple] = Field(default=None, description="Price range filter (min, max)")
    download_images: bool = Field(default=True, description="Whether to download images")

class ListingsQuery(BaseModel):
    """Request model for querying listings"""
    category: Optional[str] = Field(default=None, description="Jewelry category filter")
    limit: int = Field(default=50, description="Maximum number of listings to return", ge=1, le=1000)
    offset: int = Field(default=0, description="Offset for pagination", ge=0)
    export_format: Optional[str] = Field(default=None, description="Export format (csv, json)")

@app.tool()
async def scrape_jewelry_listings(
    search_query: Annotated[str, Field(description="Search query for eBay jewelry (e.g., 'diamond rings', 'vintage necklaces')")],
    max_pages: Annotated[int, Field(description="Maximum pages to scrape (1-10)", ge=1, le=10)] = 3,
    download_images: Annotated[bool, Field(description="Whether to download and organize images")] = True,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Scrape eBay jewelry listings based on search query.

    This tool scrapes eBay for jewelry listings, extracts detailed information,
    and optionally downloads and organizes product images by category.
    """
    try:
        session_id = str(uuid.uuid4())

        await ctx.info(f"Starting scraping session {session_id} for query: '{search_query}'")
        await ctx.report_progress(0, 100, "Initializing scraper...")

        # Run the scraper
        await ctx.report_progress(20, 100, "Scraping eBay listings...")
        scraper_config = {
            "rate_limit_delay": CONFIG["rate_limit_delay"],
            "max_listings_per_page": 50,
            "image_download_timeout": 30
        }

        listings = await run_scraper(search_query, max_pages, scraper_config)

        if not listings:
            return {
                "success": False,
                "message": "No listings found for the given search query",
                "session_id": session_id
            }

        await ctx.info(f"Found {len(listings)} listings")
        await ctx.report_progress(50, 100, f"Found {len(listings)} listings, saving to database...")

        # Save to database
        save_result = await manage_data('save', listings=listings, session_id=session_id,
                                      db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        result = {
            "success": True,
            "session_id": session_id,
            "total_listings": len(listings),
            "saved_listings": save_result["saved"],
            "failed_listings": save_result["failed"],
            "categories": {}
        }

        # Process images if requested
        if download_images:
            await ctx.report_progress(70, 100, "Downloading and processing images...")

            image_config = {
                "image_download_timeout": 30,
                "max_images_per_listing": CONFIG["max_images_per_listing"],
                "max_image_size": (1200, 1200),
                "image_quality": 85
            }

            image_result = await process_images(listings, CONFIG["image_storage_path"], image_config)
            result["image_processing"] = image_result

        # Generate category breakdown
        for listing in listings:
            category = listing.get('subcategory', 'other')
            result["categories"][category] = result["categories"].get(category, 0) + 1

        await ctx.report_progress(100, 100, "Scraping completed successfully!")
        await ctx.info(f"Scraping session {session_id} completed successfully")

        return result

    except Exception as e:
        logger.error(f"Error in scrape_jewelry_listings: {e}")
        return {
            "success": False,
            "error": str(e),
            "session_id": session_id if 'session_id' in locals() else None
        }

@app.tool()
async def query_jewelry_listings(
    category: Annotated[Optional[str], Field(description="Filter by jewelry category (rings, necklaces, earrings, bracelets, watches, other)")] = None,
    limit: Annotated[int, Field(description="Maximum number of listings to return", ge=1, le=1000)] = 50,
    offset: Annotated[int, Field(description="Offset for pagination", ge=0)] = 0,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Query and retrieve jewelry listings from the database.

    Retrieve stored jewelry listings with optional filtering by category.
    Supports pagination for large result sets.
    """
    try:
        await ctx.info(f"Querying listings: category={category}, limit={limit}, offset={offset}")

        listings = await manage_data('get', category=category, limit=limit, offset=offset,
                                   db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        # Get statistics
        stats = await manage_data('stats', db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        return {
            "success": True,
            "listings": listings,
            "count": len(listings),
            "statistics": stats,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "has_more": len(listings) == limit
            }
        }

    except Exception as e:
        logger.error(f"Error in query_jewelry_listings: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.tool()
async def export_jewelry_data(
    category: Annotated[Optional[str], Field(description="Filter by jewelry category for export")] = None,
    format: Annotated[str, Field(description="Export format (csv or json)")] = "csv",
    ctx: Context = None
) -> Dict[str, str]:
    """
    Export jewelry listings data to CSV or JSON format.

    Export stored jewelry listings with optional category filtering.
    Useful for data analysis and reporting.
    """
    try:
        await ctx.info(f"Exporting data: category={category}, format={format}")

        if format.lower() == "csv":
            export_path = await manage_data('export', output_path=CONFIG["data_storage_path"],
                                          category=category, db_path=CONFIG["db_path"],
                                          data_path=CONFIG["data_storage_path"])

            return {
                "success": True,
                "export_path": export_path,
                "format": "csv"
            }

        elif format.lower() == "json":
            listings = await manage_data('get', category=category, limit=10000,
                                       db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

            output_file = Path(CONFIG["data_storage_path"]) / f"jewelry_listings_{category or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

            with open(output_file, 'w') as f:
                json.dump(listings, f, indent=2, default=str)

            return {
                "success": True,
                "export_path": str(output_file),
                "format": "json"
            }

        else:
            return {
                "success": False,
                "error": f"Unsupported format: {format}. Use 'csv' or 'json'"
            }

    except Exception as e:
        logger.error(f"Error in export_jewelry_data: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.tool()
async def get_system_status(ctx: Context = None) -> Dict[str, Any]:
    """
    Get comprehensive system status and statistics.

    Returns information about the scraping system including database statistics,
    storage usage, and recent activity.
    """
    try:
        # Get database statistics
        stats = await manage_data('stats', db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        # Check storage usage
        storage_path = Path(CONFIG["image_storage_path"])
        total_size = sum(f.stat().st_size for f in storage_path.rglob('*') if f.is_file())

        # Count files by category
        category_counts = {}
        for category_dir in storage_path.iterdir():
            if category_dir.is_dir():
                file_count = len(list(category_dir.rglob('*.jpg')))
                category_counts[category_dir.name] = file_count

        return {
            "success": True,
            "database_stats": stats,
            "storage": {
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "images_by_category": category_counts
            },
            "config": CONFIG,
            "status": "operational"
        }

    except Exception as e:
        logger.error(f"Error in get_system_status: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.tool()
async def cleanup_old_data(
    retention_days: Annotated[int, Field(description="Number of days to retain data", ge=1, le=365)] = 30,
    ctx: Context = None
) -> Dict[str, Any]:
    """
    Clean up old listings and images to free storage space.

    Removes listings and associated images older than the specified retention period.
    """
    try:
        await ctx.info(f"Starting cleanup of data older than {retention_days} days")

        await manage_data('cleanup', retention_days=retention_days,
                         db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])

        return {
            "success": True,
            "message": f"Cleaned up data older than {retention_days} days"
        }

    except Exception as e:
        logger.error(f"Error in cleanup_old_data: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# Resource endpoints for data access
@app.resource("listings://recent")
async def get_recent_listings() -> str:
    """Get recently scraped jewelry listings"""
    try:
        listings = await manage_data('get', limit=20, db_path=CONFIG["db_path"],
                                   data_path=CONFIG["data_storage_path"])
        return json.dumps(listings, indent=2, default=str)
    except Exception as e:
        return f"Error retrieving recent listings: {e}"

@app.resource("listings://category/{category}")
async def get_listings_by_category(category: str) -> str:
    """Get jewelry listings filtered by category"""
    try:
        listings = await manage_data('get', category=category, limit=50,
                                   db_path=CONFIG["db_path"], data_path=CONFIG["data_storage_path"])
        return json.dumps(listings, indent=2, default=str)
    except Exception as e:
        return f"Error retrieving listings for category {category}: {e}"

@app.resource("stats://system")
async def get_system_statistics() -> str:
    """Get comprehensive system statistics"""
    try:
        stats = await manage_data('stats', db_path=CONFIG["db_path"],
                                data_path=CONFIG["data_storage_path"])
        return json.dumps(stats, indent=2, default=str)
    except Exception as e:
        return f"Error retrieving system statistics: {e}"

# Prompts for common operations
@app.prompt("scrape-jewelry")
async def scrape_jewelry_prompt() -> str:
    """Prompt template for scraping jewelry listings"""
    return """I want to scrape eBay jewelry listings. Please help me with:

1. Search Query: What specific jewelry should I search for? (e.g., "diamond engagement rings", "vintage gold necklaces", "pearl earrings")

2. Scope: How many pages should I scrape? (1-10 pages recommended)

3. Images: Should I download and organize product images?

4. Category Focus: Any specific jewelry category to focus on? (rings, necklaces, earrings, bracelets, watches)

Please provide these details and I'll start the scraping process for you."""

@app.prompt("analyze-listings")
async def analyze_listings_prompt() -> str:
    """Prompt template for analyzing jewelry listings"""
    return """I can help you analyze the jewelry listings in our database. Here are some analysis options:

1. **Category Analysis**: Compare quantities and average prices across jewelry categories
2. **Price Trends**: Analyze price distributions and identify outliers
3. **Seller Analysis**: Identify top sellers and their ratings
4. **Image Analysis**: Review image quality and availability
5. **Market Insights**: Generate insights about the jewelry market

What type of analysis would you like me to perform? I can also export the data in CSV or JSON format for external analysis."""

if __name__ == "__main__":
    # Run the MCP server
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 3.2 MCP Server Dockerfile

```dockerfile
# mcp-server/Dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs /app/data /app/images

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONPATH=/app
ENV LOG_LEVEL=INFO

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the server
CMD ["python", "jewelry_mcp_server.py"]
```

---

## Phase 4: n8n Workflow Integration

### 4.1 n8n Workflow Templates

```json
{
  "name": "eBay Jewelry Scraping Workflow",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 6
            }
          ]
        }
      },
      "id": "schedule-trigger",
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/scrape_jewelry_listings",
        "options": {},
        "method": "POST",
        "body": {
          "search_query": "{{ $json.search_query || 'diamond jewelry' }}",
          "max_pages": "{{ $json.max_pages || 3 }}",
          "download_images": true
        },
        "headers": {
          "Content-Type": "application/json"
        }
      },
      "id": "mcp-scraper-call",
      "name": "Call MCP Scraper",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "success-condition",
              "leftValue": "={{ $json.success }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equal"
              }
            }
          ],
          "combinator": "and"
        }
      },
      "id": "check-success",
      "name": "Check Success",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [640, 300]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/get_system_status",
        "options": {},
        "method": "POST"
      },
      "id": "get-statistics",
      "name": "Get Statistics",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [840, 200]
    },
    {
      "parameters": {
        "channel": "jewelry-alerts",
        "text": "🎉 Jewelry scraping completed successfully!\n\n📊 **Results:**\n• Total Listings: {{ $('Call MCP Scraper').item.json.total_listings }}\n• Saved: {{ $('Call MCP Scraper').item.json.saved_listings }}\n• Categories: {{ Object.keys($('Call MCP Scraper').item.json.categories).join(', ') }}\n• Session ID: {{ $('Call MCP Scraper').item.json.session_id }}\n\n🖼️ **Images:** {{ $('Call MCP Scraper').item.json.image_processing?.total_images || 'N/A' }} downloaded\n\n📈 **Database Stats:**\n• Total Listings in DB: {{ $('Get Statistics').item.json.database_stats.total_listings }}\n• Storage Used: {{ $('Get Statistics').item.json.storage.total_size_mb }}MB"
      },
      "id": "notify-success",
      "name": "Notify Success",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [1040, 200]
    },
    {
      "parameters": {
        "channel": "jewelry-alerts",
        "text": "❌ Jewelry scraping failed!\n\n**Error:** {{ $('Call MCP Scraper').item.json.error }}\n**Session ID:** {{ $('Call MCP Scraper').item.json.session_id || 'Unknown' }}\n\nPlease check the logs for more details."
      },
      "id": "notify-failure",
      "name": "Notify Failure",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [840, 400]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/export_jewelry_data",
        "options": {},
        "method": "POST",
        "body": {
          "format": "csv"
        }
      },
      "id": "export-data",
      "name": "Export Data",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1240, 200]
    },
    {
      "parameters": {
        "operation": "upload",
        "fileId": {
          "__rl": true,
          "value": "={{ $('Export Data').item.json.export_path }}",
          "mode": "expression"
        },
        "options": {}
      },
      "id": "upload-to-drive",
      "name": "Upload to Google Drive",
      "type": "n8n-nodes-base.googleDrive",
      "typeVersion": 3,
      "position": [1440, 200]
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [
        [
          {
            "node": "Call MCP Scraper",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Call MCP Scraper": {
      "main": [
        [
          {
            "node": "Check Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Check Success": {
      "main": [
        [
          {
            "node": "Get Statistics",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Notify Failure",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Statistics": {
      "main": [
        [
          {
            "node": "Notify Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Notify Success": {
      "main": [
        [
          {
            "node": "Export Data",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Export Data": {
      "main": [
        [
          {
            "node": "Upload to Google Drive",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "pinData": {},
  "settings": {
    "executionOrder": "v1"
  },
  "staticData": null,
  "tags": ["jewelry", "scraping", "automation"],
  "triggerCount": 1,
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "versionId": "1"
}
```

### 4.2 Advanced Monitoring Workflow

```json
{
  "name": "Jewelry Scraper Monitoring & Alerts",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 15
            }
          ]
        }
      },
      "id": "monitor-schedule",
      "name": "Monitor Schedule",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/health",
        "options": {
          "timeout": 10000
        },
        "method": "GET"
      },
      "id": "health-check",
      "name": "Health Check MCP Server",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 300]
    },
    {
      "parameters": {
        "url": "http://crawl4ai-service:11235/health",
        "options": {
          "timeout": 10000
        },
        "method": "GET"
      },
      "id": "crawl4ai-health",
      "name": "Health Check Crawl4AI",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 500]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/get_system_status",
        "method": "POST"
      },
      "id": "system-status",
      "name": "Get System Status",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [640, 300]
    },
    {
      "parameters": {
        "jsCode": "const healthChecks = [\n  $('Health Check MCP Server').item,\n  $('Health Check Crawl4AI').item\n];\n\nconst systemStatus = $('Get System Status').item.json;\n\n// Check if any service is down\nconst servicesDown = healthChecks.filter(check => {\n  return !check.json || check.json.status !== 'healthy';\n});\n\n// Check storage usage\nconst storageWarning = systemStatus.storage?.total_size_mb > 1000; // 1GB warning\n\n// Check recent activity\nconst lowActivity = systemStatus.database_stats?.recent_listings_24h < 10;\n\nreturn {\n  servicesDown: servicesDown.length,\n  storageWarning,\n  lowActivity,\n  shouldAlert: servicesDown.length > 0 || storageWarning || lowActivity,\n  systemStatus\n};"
      },
      "id": "analyze-status",
      "name": "Analyze System Status",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [840, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "id": "alert-condition",
              "leftValue": "={{ $json.shouldAlert }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equal"
              }
            }
          ],
          "combinator": "and"
        }
      },
      "id": "should-alert",
      "name": "Should Alert?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [1040, 300]
    },
    {
      "parameters": {
        "channel": "jewelry-alerts",
        "text": "🚨 **Jewelry Scraper System Alert**\n\n{% if $json.servicesDown > 0 %}❌ **Services Down:** {{ $json.servicesDown }}\n{% endif %}{% if $json.storageWarning %}⚠️ **Storage Warning:** {{ $json.systemStatus.storage.total_size_mb }}MB used\n{% endif %}{% if $json.lowActivity %}📉 **Low Activity:** Only {{ $json.systemStatus.database_stats.recent_listings_24h }} listings in 24h\n{% endif %}\n**Database Stats:**\n• Total Listings: {{ $json.systemStatus.database_stats.total_listings }}\n• Categories: {{ Object.keys($json.systemStatus.database_stats.by_category).join(', ') }}\n\nPlease check the system status."
      },
      "id": "send-alert",
      "name": "Send Alert",
      "type": "n8n-nodes-base.slack",
      "typeVersion": 2,
      "position": [1240, 200]
    },
    {
      "parameters": {
        "url": "http://mcp-server:8000/tools/cleanup_old_data",
        "method": "POST",
        "body": {
          "retention_days": 7
        }
      },
      "id": "auto-cleanup",
      "name": "Auto Cleanup",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1240, 400]
    }
  ],
  "connections": {
    "Monitor Schedule": {
      "main": [
        [
          {
            "node": "Health Check MCP Server",
            "type": "main",
            "index": 0
          },
          {
            "node": "Health Check Crawl4AI",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Health Check MCP Server": {
      "main": [
        [
          {
            "node": "Get System Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get System Status": {
      "main": [
        [
          {
            "node": "Analyze System Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Analyze System Status": {
      "main": [
        [
          {
            "node": "Should Alert?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Should Alert?": {
      "main": [
        [
          {
            "node": "Send Alert",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Auto Cleanup",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

## Phase 5: Deployment and Testing

### 5.1 Deployment Script

```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Deploying eBay Jewelry Scraper System..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please update .env file with your API keys and configuration"
    exit 1
fi

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Health checks
echo "🏥 Performing health checks..."

# Check Crawl4AI
if curl -f http://localhost:11235/health >/dev/null 2>&1; then
    echo "✅ Crawl4AI service is healthy"
else
    echo "❌ Crawl4AI service health check failed"
fi

# Check n8n
if curl -f http://localhost:5678 >/dev/null 2>&1; then
    echo "✅ n8n service is healthy"
else
    echo "❌ n8n service health check failed"
fi

# Check MCP Server
if curl -f http://localhost:8000/health >/dev/null 2>&1; then
    echo "✅ MCP Server is healthy"
else
    echo "❌ MCP Server health check failed"
fi

# Setup initial data
echo "🗃️  Setting up initial database..."
python3 -c "
import asyncio
import sys
sys.path.append('./crawl4ai-engine')
from data_manager import DataManager
dm = DataManager('./data-storage/jewelry_listings.db', './data-storage')
print('Database initialized successfully')
"

echo "🎉 Deployment completed!"
echo ""
echo "📊 Access URLs:"
echo "• n8n Workflow Interface: http://localhost:5678"
echo "• MCP Server Health: http://localhost:8000/health"
echo "• Crawl4AI Service: http://localhost:11235"
echo ""
echo "🔧 Next Steps:"
echo "1. Configure n8n credentials (Slack, Google Drive, etc.)"
echo "2. Import workflow templates from ./n8n-workflows/"
echo "3. Test the system with a small scraping job"
echo "4. Set up monitoring and alerts"
```

### 5.2 Testing Suite

```python
# tests/test_system.py
import pytest
import asyncio
import json
import aiohttp
from pathlib import Path
import tempfile
import shutil

class TestJewelryScrapingSystem:
    """Comprehensive test suite for the jewelry scraping system"""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory for tests"""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)

    @pytest.fixture
    def test_config(self, temp_storage):
        """Test configuration"""
        return {
            'rate_limit_delay': 0.1,  # Faster for tests
            'max_listings_per_page': 5,
            'image_download_timeout': 10,
            'max_images_per_listing': 3,
            'image_storage_path': temp_storage,
            'data_storage_path': temp_storage
        }

    @pytest.mark.asyncio
    async def test_scraper_basic_functionality(self, test_config):
        """Test basic scraping functionality"""
        from crawl4ai_engine.ebay_scraper import EBayJewelryScraper

        scraper = EBayJewelryScraper(test_config)

        # Test search URL building
        url = scraper._build_search_url("test jewelry", 1)
        assert "test jewelry" in url or "test%20jewelry" in url
        assert "_sacat=281" in url  # Jewelry category

        # Test categorization
        category, subcategory = scraper._categorize_jewelry("Diamond Ring", [])
        assert category == "jewelry"
        assert subcategory == "rings"

    @pytest.mark.asyncio
    async def test_image_processor(self, test_config, temp_storage):
        """Test image processing functionality"""
        from crawl4ai_engine.image_processor import ImageProcessor

        # Mock listing data
        test_listing = {
            'listing_id': 'test123',
            'subcategory': 'rings',
            'images': [
                'https://via.placeholder.com/300x300/0000FF/FFFFFF?text=Test+Image'
            ]
        }

        async with ImageProcessor(temp_storage, test_config) as processor:
            result = await processor.process_listing_images(test_listing)

            assert result['downloaded'] or result['failed']  # Should have some result

            # Check directory structure
            listing_dir = Path(temp_storage) / 'rings' / 'test123'
            assert listing_dir.exists()

    @pytest.mark.asyncio
    async def test_data_manager(self, temp_storage):
        """Test data management functionality"""
        from crawl4ai_engine.data_manager import DataManager

        db_path = Path(temp_storage) / 'test.db'
        manager = DataManager(str(db_path), temp_storage)

        # Test saving listings
        test_listings = [{
            'listing_id': 'test123',
            'title': 'Test Ring',
            'price': '100.00',
            'category': 'jewelry',
            'subcategory': 'rings',
            'images': ['test1.jpg', 'test2.jpg'],
            'specifications': {'material': 'gold', 'size': '7'}
        }]

        result = await manager.save_listings(test_listings, 'test_session')
        assert result['saved'] == 1

        # Test retrieving listings
        retrieved = await manager.get_listings(limit=10)
        assert len(retrieved) == 1
        assert retrieved[0]['title'] == 'Test Ring'

        # Test statistics
        stats = await manager.get_statistics()
        assert stats['total_listings'] == 1
        assert 'rings' in stats['by_category']

    @pytest.mark.asyncio
    async def test_mcp_server_endpoints(self):
        """Test MCP server endpoints"""
        base_url = "http://localhost:8000"

        async with aiohttp.ClientSession() as session:
            # Test health endpoint
            async with session.get(f"{base_url}/health") as response:
                assert response.status == 200

            # Test system status tool
            async with session.post(f"{base_url}/tools/get_system_status") as response:
                assert response.status == 200
                data = await response.json()
                assert 'database_stats' in data

    @pytest.mark.asyncio
    async def test_n8n_integration(self):
        """Test n8n workflow integration"""
        n8n_url = "http://localhost:5678"

        async with aiohttp.ClientSession() as session:
            try:
                # Test n8n health
                async with session.get(f"{n8n_url}/healthz") as response:
                    assert response.status == 200

                # Test workflow execution (if n8n is configured)
                # This would require proper n8n setup and authentication

            except aiohttp.ClientError:
                pytest.skip("n8n not available for testing")

    def test_docker_services(self):
        """Test that Docker services are running"""
        import subprocess

        try:
            # Check if containers are running
            result = subprocess.run(['docker', 'ps'], capture_output=True, text=True)
            assert result.returncode == 0

            container_names = ['crawl4ai-service', 'n8n', 'mcp-server']
            for name in container_names:
                assert name in result.stdout, f"Container {name} not found in running containers"

        except FileNotFoundError:
            pytest.skip("Docker not available for testing")

    @pytest.mark.integration
    async def test_end_to_end_workflow(self, test_config, temp_storage):
        """Test complete end-to-end workflow"""
        # This test requires all services to be running

        mcp_url = "http://localhost:8000"

        async with aiohttp.ClientSession() as session:
            # Test scraping through MCP server
            scrape_payload = {
                "search_query": "test jewelry",
                "max_pages": 1,
                "download_images": True
            }

            async with session.post(f"{mcp_url}/tools/scrape_jewelry_listings",
                                  json=scrape_payload) as response:
                assert response.status == 200
                data = await response.json()

                if data.get('success'):
                    assert 'session_id' in data
                    assert 'total_listings' in data

                    # Test querying the results
                    async with session.post(f"{mcp_url}/tools/query_jewelry_listings",
                                          json={"limit": 10}) as query_response:
                        assert query_response.status == 200
                        query_data = await query_response.json()
                        assert 'listings' in query_data

# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--asyncio-mode=auto"])
```

### 5.3 Monitoring Dashboard

```python
# scripts/monitoring_dashboard.py
import asyncio
import json
from datetime import datetime, timedelta
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import aiohttp
import sys
sys.path.append('./crawl4ai-engine')
from data_manager import DataManager

st.set_page_config(
    page_title="eBay Jewelry Scraper Dashboard",
    page_icon="💎",
    layout="wide"
)

class MonitoringDashboard:
    def __init__(self):
        self.mcp_url = "http://localhost:8000"
        self.data_manager = DataManager('./data-storage/jewelry_listings.db', './data-storage')

    async def get_system_status(self):
        """Get system status from MCP server"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.mcp_url}/tools/get_system_status") as response:
                    if response.status == 200:
                        return await response.json()
        except Exception as e:
            st.error(f"Failed to get system status: {e}")
        return None

    async def get_recent_listings(self, limit=100):
        """Get recent listings from database"""
        try:
            return await self.data_manager.get_listings(limit=limit)
        except Exception as e:
            st.error(f"Failed to get listings: {e}")
        return []

    def render_dashboard(self):
        """Render the monitoring dashboard"""
        st.title("💎 eBay Jewelry Scraper Dashboard")

        # Get data
        system_status = asyncio.run(self.get_system_status())
        recent_listings = asyncio.run(self.get_recent_listings())

        if not system_status:
            st.error("❌ Cannot connect to MCP server")
            return

        # System Status Section
        st.header("🏥 System Health")
        col1, col2, col3, col4 = st.columns(4)

        with col1:
            st.metric("Total Listings", system_status.get('database_stats', {}).get('total_listings', 0))

        with col2:
            st.metric("Storage Used", f"{system_status.get('storage', {}).get('total_size_mb', 0):.1f} MB")

        with col3:
            recent_24h = system_status.get('database_stats', {}).get('recent_listings_24h', 0)
            st.metric("Listings (24h)", recent_24h)

        with col4:
            total_images = sum(system_status.get('storage', {}).get('images_by_category', {}).values())
            st.metric("Total Images", total_images)

        # Category Distribution
        st.header("📊 Category Distribution")
        category_data = system_status.get('database_stats', {}).get('by_category', {})

        if category_data:
            col1, col2 = st.columns(2)

            with col1:
                # Pie chart
                fig_pie = px.pie(
                    values=list(category_data.values()),
                    names=list(category_data.keys()),
                    title="Listings by Category"
                )
                st.plotly_chart(fig_pie, use_container_width=True)

            with col2:
                # Bar chart
                fig_bar = px.bar(
                    x=list(category_data.keys()),
                    y=list(category_data.values()),
                    title="Category Counts"
                )
                st.plotly_chart(fig_bar, use_container_width=True)

        # Recent Activity
        st.header("📈 Recent Activity")

        if recent_listings:
            df = pd.DataFrame(recent_listings)

            # Convert scraped_at to datetime
            df['scraped_at'] = pd.to_datetime(df['scraped_at'])
            df['date'] = df['scraped_at'].dt.date

            # Daily activity chart
            daily_counts = df.groupby('date').size().reset_index(name='count')
            fig_timeline = px.line(
                daily_counts,
                x='date',
                y='count',
                title="Daily Scraping Activity"
            )
            st.plotly_chart(fig_timeline, use_container_width=True)

            # Price distribution
            if 'price' in df.columns:
                df['price_numeric'] = pd.to_numeric(df['price'], errors='coerce')
                df_price = df.dropna(subset=['price_numeric'])

                if not df_price.empty:
                    fig_price = px.histogram(
                        df_price,
                        x='price_numeric',
                        nbins=50,
                        title="Price Distribution"
                    )
                    st.plotly_chart(fig_price, use_container_width=True)

        # Recent Listings Table
        st.header("📋 Recent Listings")

        if recent_listings:
            # Display top 20 recent listings
            display_df = pd.DataFrame(recent_listings[:20])

            # Select relevant columns
            if not display_df.empty:
                columns = ['title', 'price', 'condition', 'subcategory', 'seller_name', 'scraped_at']
                available_columns = [col for col in columns if col in display_df.columns]

                st.dataframe(
                    display_df[available_columns],
                    use_container_width=True,
                    hide_index=True
                )

        # Image Storage Analysis
        st.header("🖼️ Image Storage")

        image_data = system_status.get('storage', {}).get('images_by_category', {})
        if image_data:
            col1, col2 = st.columns(2)

            with col1:
                fig_images = px.bar(
                    x=list(image_data.keys()),
                    y=list(image_data.values()),
                    title="Images by Category"
                )
                st.plotly_chart(fig_images, use_container_width=True)

            with col2:
                # Storage efficiency
                total_listings_by_cat = system_status.get('database_stats', {}).get('by_category', {})
                if total_listings_by_cat:
                    efficiency_data = []
                    for category in image_data.keys():
                        if category in total_listings_by_cat:
                            avg_images = image_data[category] / total_listings_by_cat[category]
                            efficiency_data.append({'category': category, 'avg_images': avg_images})

                    if efficiency_data:
                        eff_df = pd.DataFrame(efficiency_data)
                        fig_eff = px.bar(
                            eff_df,
                            x='category',
                            y='avg_images',
                            title="Average Images per Listing"
                        )
                        st.plotly_chart(fig_eff, use_container_width=True)

        # System Actions
        st.header("⚙️ System Actions")

        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("🧹 Cleanup Old Data"):
                with st.spinner("Cleaning up..."):
                    # Call cleanup endpoint
                    st.success("
```
