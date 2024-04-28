#!/bin/bash

# Creates the service that allows executing commands at VM startup
sudo cat > /etc/systemd/system/rc-local.service << EOF
[Unit]
Description=/etc/rc.local Compatibility
ConditionPathExists=/etc/rc.local

[Service]
Type=forking
ExecStart=/etc/rc.local start
TimeoutSec=0
StandardOutput=tty
RemainAfterExit=yes
SysVStartPriority=99

[Install]
WantedBy=multi-user.target
EOF

sudo chmod +x /etc/rc.local
sudo systemctl enable rc-local
sudo systemctl start rc-local
sudo systemctl status rc-local