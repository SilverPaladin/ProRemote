
#!/bin/bash
npm run build
php -d phar.readonly=0 build-phar.php
phpacker build all --src=./proremote.phar
#phpacker build windows x64 --src=./proremote.phar
#phpacker build mac arm --src=./proremote.phar
#./build/windows/windows-x64.exe
