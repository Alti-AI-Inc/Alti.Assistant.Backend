 docker build -t alti . 

 docker tag alti us-central1-docker.pkg.dev/gen-lang-client-0159237802/cloud-run-source-deploy/altibackend:latest 

 docker push us-central1-docker.pkg.dev/gen-lang-client-0159237802/cloud-run-source-deploy/altibackend:latest

 ssh -i C:\Users\UseR\.ssh\alti_vm user@34.29.4.131 ./pull_run.sh 