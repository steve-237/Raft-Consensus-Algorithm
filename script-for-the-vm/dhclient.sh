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

# execute dhclient when the VM is starting up
sudo cat > /etc/rc.local << EOF
#!/bin/bash
sudo dhclient
exit 0
EOF

sudo chmod +x /etc/rc.local
sudo systemctl enable rc-local
sudo systemctl start rc-local
sudo systemctl status rc-local