#!/bin/bash

# Display an error and exit
display_error() {
  echo "Error: $1"
  exit 1
}

# Set debconf selections for MariaDB
set_mariadb_debconf() {
  debconf-set-selections <<< "mariadb-server mysql-server/root_password password root"
  debconf-set-selections <<< "mariadb-server mysql-server/root_password_again password root"
}

# Set debconf selections for Postfix
set_postfix_debconf() {
  debconf-set-selections <<< "postfix postfix/mailname string localhost"
  debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"
  debconf-set-selections <<< "postfix postfix/destinations string localhost.localdomain, localhost, root@localhost, root@fau.de"
}

# Install packages
install_packages() {
  apt-get update
  apt purge 'mysql*' -y
  apt purge 'mariadb*' -y
  apt autoremove -y
  apt autoclean -y
  apt-get install -y nginx php8.1 php8.1-fpm php8.1-mysql mariadb-server poppler-utils npm nodejs git
  npm install -g express
  npm install
}

# Configure Nginx
configure_nginx() {
  nginx_config="/etc/nginx/sites-available/hotcrp"
  [ -e "$nginx_config" ] && rm -f "$nginx_config"

  cat <<EOF > "$nginx_config"
server {
    listen 80;
    server_name localhost;
    root /var/www/html/hotcrp;
    index index.php;

    location / {
        try_files \$uri \$uri/ /index.php?\$args;
    }
    
    #Interprets php page using fastcgi-php before sending them to the client
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    }
}
EOF

  ln -sf "$nginx_config" /etc/nginx/sites-enabled
  nginx -t
  systemctl restart nginx
}

# Install MariaDB
install_mariadb() {
  set_mariadb_debconf
  install_packages
  apt-get install -y mariadb-server
  echo "y" | sudo apt autoremove
}

# Run HotCRP database configuration script
configure_hotcrp_db() {
  git clone https://github.com/kohler/hotcrp.git /var/www/html/hotcrp
  cd /var/www/html/hotcrp
  (echo "ok\n"; printf "conference\n") | ./lib/createdb.sh
}

# Update PHP settings
update_php_settings() {
  php_ini="/etc/php/8.1/fpm/php.ini"
  sed -i 's/upload_max_filesize = .*/upload_max_filesize = 15M/' "$php_ini"
  sed -i 's/post_max_size = .*/post_max_size = 20M/' "$php_ini"
  sed -i 's/max_input_vars = .*/max_input_vars = 4096/' "$php_ini"
  sed -i 's/session.gc_maxlifetime = .*/session.gc_maxlifetime = 86400/' "$php_ini"

  systemctl restart php8.1-fpm
}

# Modify MariaDB configuration file
modify_mariadb_config() {
  mariadb_conf="/etc/mysql/mariadb.conf.d/50-server.cnf"
  echo -e "[mysqld]\nmax_allowed_packet=32M" >> "$mariadb_conf"
  systemctl restart mariadb
}

# Install Postfix
install_postfix() {
  set_postfix_debconf
  apt-get install -y postfix
  echo "y" | sudo apt autoremove
}

# Main script execution
if [ "$EUID" -ne 0 ]; then
  display_error "Please run this script as root."
fi

install_mariadb
configure_nginx
configure_hotcrp_db
update_php_settings
modify_mariadb_config
install_postfix

# Display installation completion message with default values
echo "MariaDB and MySQL User: conference or root"
echo "Database Name: conference"
echo "MariaDB Password: root"
echo "Postfix Email: root@fau.de"
echo "HotCRP installation completed successfully."

