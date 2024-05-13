#!/bin/bash

DB_USER='root'
DB_PASS=''
DB_NAME='testapp'

TEST_USER='testuser'
TEST_PASS='test'

if [ "$EUID" -ne 0 ]; then
  display_error "Please run this script as root."
fi

MYSQL_CMD="mysql -u${DB_USER} --password="

$MYSQL_CMD -e "CREATE USER IF NOT EXISTS '${TEST_USER}'@'localhost' IDENTIFIED BY '${TEST_PASS}';"
$MYSQL_CMD -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${TEST_USER}'@'localhost';"
$MYSQL_CMD -e "FLUSH PRIVILEGES"

echo "User created successfully."

$MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
$MYSQL_CMD -e "USE ${DB_NAME}; CREATE TABLE IF NOT EXISTS results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    result INT
);"

echo "Database and table created successfully."