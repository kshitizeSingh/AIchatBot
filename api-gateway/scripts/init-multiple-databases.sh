#!/bin/bash

# Script to create multiple databases and users in PostgreSQL
# Used by docker-compose to initialize the database container

set -e
set -u

# Function to create database and user
create_database_and_user() {
    local database=$1
    local user=$2
    local password=$3
    
    echo "Creating database '$database' and user '$user'..."
    
    # Create user if it doesn't exist
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$user') THEN
                CREATE ROLE $user LOGIN PASSWORD '$password';
            END IF;
        END
        \$\$;
EOSQL
    
    # Create database if it doesn't exist
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE $database OWNER $user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
EOSQL
    
    # Grant privileges
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" <<-EOSQL
        GRANT ALL PRIVILEGES ON DATABASE $database TO $user;
        GRANT ALL ON SCHEMA public TO $user;
EOSQL
    
    echo "Database '$database' and user '$user' created successfully."
}

# Main execution
if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    echo "Creating multiple databases: $POSTGRES_MULTIPLE_DATABASES"
    
    # Split databases by comma
    IFS=',' read -ra DATABASES <<< "$POSTGRES_MULTIPLE_DATABASES"
    
    # Split users by comma if provided
    if [ -n "${POSTGRES_MULTIPLE_USERS:-}" ]; then
        IFS=',' read -ra USERS <<< "$POSTGRES_MULTIPLE_USERS"
    else
        USERS=()
    fi
    
    # Create each database
    for i in "${!DATABASES[@]}"; do
        database="${DATABASES[$i]}"
        
        if [ ${#USERS[@]} -gt $i ]; then
            # Parse user:password format
            user_info="${USERS[$i]}"
            if [[ $user_info == *":"* ]]; then
                user="${user_info%:*}"
                password="${user_info#*:}"
            else
                user="$user_info"
                password="defaultpassword"
            fi
        else
            # Use database name as username with default password
            user="$database"
            password="defaultpassword"
        fi
        
        create_database_and_user "$database" "$user" "$password"
    done
    
    echo "All databases created successfully."
else
    echo "No additional databases to create."
fi