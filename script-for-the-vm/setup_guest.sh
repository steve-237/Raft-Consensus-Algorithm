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
  - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDhKao6zPRBuEGZU+qbC9RrgoT2M93Ek/ftLMdtlZvV7M1YWUwbw70DqoG+/IBSPIjIPACYT9qIJRXtWM/0DBLvXFzCDd4gPezVbnoVpT7nM+CIdX+ciqx4lHp5UUeCghEms6qo0cXIXjJW4yZgb7fOrW2xZYm0cdQlR0EKYIEXni3e1poHpfe8ZdwqFeqoc/jkK3cyPVUFEdgzrDkn6c+Ga+Ow1mGtrmINScIxFVHO6MW4MeofOEyDPqKnP0Zx4Fdc0HFN3GW438P+QlGNzWUSWDF1vC6s7tV71mBvUSh61MlH9ofb3q5EgqpyLquCW+38In0Ebir+C7Wu7cjhz6T0uZy5joM9MurOwu+iLHxKTFv46Eg17oU5s6wI8uf+GE8yHjRHgBCuBa2UljUeAym1w4j8tD4Opdco26Y7ZcaO7gHLp5GSe7ep54CbAspPKhEjpB0MM0fHEOFPD1BKcgfkTMWOEEI7ohbd4BG+e/1cS3xtqRwSqi+fQvWq7YID5nM= pegouen@i4epyc1
runcmd:  
 - apt-get update
 - apt-get upgrade
 - apt-get install clang make libpcre2-dev libdb5.3-dev libdb5.3 libssl-dev -y
 - sudo useradd -m exim
 - usermod --password $(echo password | openssl passwd -1 -stdin) exim 
 - dpkg -i /snp/*
 - sudo chmod u+x dhclient.sh
 - sudo ./dhclient.sh
 - sudo chmod u+x test-app/install_test-app.sh
 - sudo ./test-app/install_test-app.sh
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
    sleep 3
    sudo mkdir -p /tmp/sev-guest
    sudo mount /dev/nbd${NBD_INDEX}p1 /tmp/sev-guest/
    sudo mkdir -p /tmp/sev-guest/snp
}
mount_fs
sudo mkdir -p /tmp/sev-guest/home/ubuntu/raft/
sudo cp -r raft/* /tmp/sev-guest/home/ubuntu/raft/
sudo cp rc.local /tmp/sev-guest/etc/
sudo cp dhclient.sh /tmp/sev-guest/
sudo mkdir -p /tmp/sev-guest/test-app/
sudo cp -r test-app/* /tmp/sev-guest/test-app/
sudo cp snp-release-2024-05-02/linux/guest/* /tmp/sev-guest/snp
unmount_fs() {
    sudo umount /tmp/sev-guest
    sudo qemu-nbd --disconnect /dev/nbd$NBD_INDEX
}
unmount_fs

sleep 10

sudo cloud-localds user-data.img cloud-config metadata.yaml
sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network
