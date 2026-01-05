#!/bin/bash
# Deploy Bibliography MCP to Azure
# Usage: ./deploy.sh -g <resource-group> [-e <environment>] [-l <location>] [-i <container-image>]

set -e

# Default values
ENVIRONMENT="dev"
LOCATION="eastus"
CONTAINER_IMAGE=""

# Parse arguments
while getopts "g:e:l:i:h" opt; do
    case $opt in
        g) RESOURCE_GROUP="$OPTARG" ;;
        e) ENVIRONMENT="$OPTARG" ;;
        l) LOCATION="$OPTARG" ;;
        i) CONTAINER_IMAGE="$OPTARG" ;;
        h)
            echo "Usage: $0 -g <resource-group> [-e <environment>] [-l <location>] [-i <container-image>]"
            echo "  -g  Resource group name (required)"
            echo "  -e  Environment: dev, staging, prod (default: dev)"
            echo "  -l  Azure location (default: eastus)"
            echo "  -i  Container image to deploy"
            exit 0
            ;;
        \?)
            echo "Invalid option: -$OPTARG" >&2
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$RESOURCE_GROUP" ]; then
    echo "Error: Resource group is required (-g)"
    exit 1
fi

echo "Deploying Bibliography MCP Server to Azure"
echo "Resource Group: $RESOURCE_GROUP"
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"

# Check if logged in to Azure
if ! az account show > /dev/null 2>&1; then
    echo "Please log in to Azure first:"
    az login
fi

# Create resource group if it doesn't exist
if [ "$(az group exists --name "$RESOURCE_GROUP")" = "false" ]; then
    echo "Creating resource group $RESOURCE_GROUP..."
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
fi

# Build parameters
PARAMS="location=$LOCATION environment=$ENVIRONMENT"
if [ -n "$CONTAINER_IMAGE" ]; then
    PARAMS="$PARAMS containerImage=$CONTAINER_IMAGE"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Deploying Bicep template..."

# Deploy the Bicep template
DEPLOYMENT=$(az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$SCRIPT_DIR/main.bicep" \
    --parameters $PARAMS \
    --output json)

STATE=$(echo "$DEPLOYMENT" | jq -r '.properties.provisioningState')

if [ "$STATE" = "Succeeded" ]; then
    echo ""
    echo "Deployment successful!"
    echo ""
    echo "Outputs:"
    echo "  Container App URL: $(echo "$DEPLOYMENT" | jq -r '.properties.outputs.containerAppUrl.value')"
    echo "  Log Analytics ID: $(echo "$DEPLOYMENT" | jq -r '.properties.outputs.logAnalyticsWorkspaceId.value')"
    echo "  Storage Account: $(echo "$DEPLOYMENT" | jq -r '.properties.outputs.storageAccountName.value')"
else
    echo ""
    echo "Deployment failed!"
    echo "$DEPLOYMENT" | jq '.properties.error'
    exit 1
fi
