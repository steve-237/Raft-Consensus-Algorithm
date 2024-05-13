#!/bin/bash

install_packages() {
  apt purge 'mysql*' -y
  apt purge 'mariadb*' -y
  apt autoremove -y
  apt autoclean -y
  apt-get install -y nginx php8.1 php8.1-fpm php8.1-mysql mariadb-server poppler-utils npm nodejs git
  npm install -g express
  npm install
}

configure_nginx() {
  nginx_config="/etc/nginx/sites-available/hotcrp"
  [ -e "$nginx_config" ] && rm -f "$nginx_config"

  cat <<EOF > "$nginx_config"
server {
    listen 80;
    server_name localhost;
    root /var/www/html/test-app;
    index index.php;
    access_log /var/log/nginx/full_access.log full;

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

install_mariadb() {
  set_mariadb_debconf
  install_packages
  apt-get install -y mariadb-server
  echo "y" | sudo apt autoremove
}

configure_test-app() {
  cp index.php /www/html/test-app
  cd /var/www/html/test-app
  ./create_db.sh
}

modify_mariadb_config() {
  mariadb_conf="/etc/mysql/mariadb.conf.d/50-server.cnf"
  echo -e "[mysqld]\nmax_allowed_packet=32M" >> "$mariadb_conf"
  systemctl restart mariadb
}

update_php_settings() {
  php_ini="/etc/php/8.1/fpm/php.ini"
  sed -i 's/upload_max_filesize = .*/upload_max_filesize = 15M/' "$php_ini"
  sed -i 's/post_max_size = .*/post_max_size = 20M/' "$php_ini"
  sed -i 's/max_input_vars = .*/max_input_vars = 4096/' "$php_ini"
  sed -i 's/session.gc_maxlifetime = .*/session.gc_maxlifetime = 86400/' "$php_ini"

  systemctl restart php8.1-fpm
}

if [ "$EUID" -ne 0 ]; then
  display_error "Please run this script as root."
fi

install_mariadb
configure_nginx
configure_test-app
update_php_settings
modify_mariadb_config

echo "Test-app installation completed successfully."
