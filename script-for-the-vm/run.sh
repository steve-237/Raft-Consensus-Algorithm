#!/bin/bash 
sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network -sev-snp -smp 16 -mem 8192 # secure with sev-snp
# sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network -sev-es # secure but only encrypted state
# sudo ./launch-qemu.sh -hda sev-guest.qcow2 -cdrom user-data.img -default-network  # start the vm without any protection
