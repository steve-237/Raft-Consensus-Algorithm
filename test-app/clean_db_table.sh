#!/bin/bash

TEST_USER='testuser'
TEST_PASS='test'
DB_NAME='testapp'

if [ "$EUID" -ne 0 ]; then
  display_error "Please run this script as root."
fi

MYSQL_CMD="mysql -u${TEST_USER} -p${TEST_PASS}"

$MYSQL_CMD -e "USE ${DB_NAME}; TRUNCATE TABLE results;"

echo "All tables have been truncated in the database ${DB_NAME}."