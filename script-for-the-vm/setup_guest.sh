#!/bin/sh
set -e
NBD_INDEX=10
IMAGE="base.img"

if [ ! -e $IMAGE ] 
then
    #wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img -O $IMAGE # ubuntu 20.04
    wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img -O $IMAGE # ubuntu 22.04
    #wget https://cloud.debian.org/images/cloud/bullseye/20230601-1398/debian-11-generic-amd64-20230601-1398.qcow2 -O $IMAGE # debian 11
fi

sudo qemu-img create -b $IMAGE -f qcow2 -F qcow2 sev-guest.qcow2 50G 

cat >cloud-config <<EOF
#cloud-config
password: password
chpasswd: { expire: False }
ssh_pwauth: True 
ssh_authorized_keys:   
  - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDQEJDJ1NumNqzheCCr2i4C7IyNSWR9uUii6+37gBjFXeseR21d3oTGZ5dOfNXRo+ac1oFiS4ezooxp8oJZ95OqjUgVkqmHRwbhwuxetWw1yK/dT1DjUwxSo4UNOauqnFrQo7rlB9+jCbWAnyjaf2ythT9x4OnP+0M7RKkbIcj/eTi1q+TOEEIA/VH8Z8L4NJDMl4njIOoUZ4Fj9nv2cgv1c6WFRPlMUQ5S2K0yEcyjtHOKP2eY4Pj2ynB+UERHXY1vHGG95ip1Nzd8Gy7TZrD5Q+4UtjRnlJw2ZKn1ejnbRSY0nW+/FTW7hLpBbUa0WUEQrm/S8bMHUX8z3CGkNhvYSHxSVVoTcT/XgqpGsfb8dRu4qj49l0xd2Z7h1lcSbcPNGoMNtUvwDYQBfvi47tWmpMTcJ1VMb9sPztGINWJC3KNsMA/aOPS9L4wur1lR4BmsN5ov5S0Ojh7BCktycmomYeu/d7MYsEXv+qgb18zAgt1JejSAUK/TMmdyGc4VrSk= messadi@epyc1 
runcmd:  
 - apt-get update
 - apt-get upgrade
 - sudo apt purge 'mysql*'
 - sudo apt purge 'mariadb*'
 - sudo apt autoremove
 - sudo apt autoclean
 - curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
 - source ~/.bashrc
 - nvm install 18
 - apt-get install clang make libpcre2-dev libdb5.3-dev libdb5.3 libssl-dev npm -y
 - sudo npm install -g express
 - sudo npm install
 - sudo useradd -m exim
 - usermod --password $(echo password | openssl passwd -1 -stdin) exim 
 - dpkg -i /snp/*
 - sudo chmod u+x dhclient.sh
 - ./dhclient.sh
 - sudo chmod u+x install_hotcrp.sh
 - ./install_hotcrp.sh
 - update-grub2
 - shutdown now
final_message: "Cloud init is done! Restart the VM" 
EOF

cleanup() {
    set +e
    echo "Cleaning up"
    sudo qemu-nbd --disconnect /dev/nbd$NBD_INDEX
    sudo umount /tmp/sev-guest
    sudo rm /tmp/sev-guest -r
}

trap cleanup EXIT

mount_fs() {
    sudo modprobe nbd max_part=8
    sudo qemu-nbd --connect=/dev/nbd$NBD_INDEX sev-guest.qcow2
    sudo mkdir -p /tmp/sev-guest
    sudo mount /dev/nbd${NBD_INDEX}p1 /tmp/sev-guest/
    sudo mkdir -p /tmp/sev-guest/snp
}
mount_fs
sudo cp raft/* /tmp/sev-guest/home/ubuntu/raft/
sudo cp dhclient.sh /tmp/sev-guest/
sudo cp install_hotcrp.sh /tmp/sev-guest/
sudo cp snp-release-2023-11-16/linux/guest/* /tmp/sev-guest/snp
unmount_fs() {
    sudo umount /tmp/sev-guest
    sudo qemu-nbd --disconnect /dev/nbd$NBD_INDEX
}
unmount_fs

sleep 10

sudo cloud-localds user-data.img cloud-config metadata.yaml
sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network
