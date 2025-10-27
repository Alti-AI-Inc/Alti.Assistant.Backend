 docker build -t asonai . 

 docker tag asonai us-central1-docker.pkg.dev/gen-lang-client-0159237802/cloud-run-source-deploy/asonaibackend:latest 

 docker push us-central1-docker.pkg.dev/gen-lang-client-0159237802/cloud-run-source-deploy/asonaibackend:latest

 ssh -i C:\Users\UseR\.ssh\ason_vm user@34.29.4.131 ./pull_run.sh 