
#!/bin/bash
npm run build
php -d phar.readonly=0 build-phar.php
phpacker build all --src=./propresenter-remote.phar
#phpacker build windows x64 --src=./propresenter-remote.phar
#phpacker build mac arm --src=./propresenter-remote.phar
#./build/windows/windows-x64.exe
