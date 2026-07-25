 docker build -t inso . 

 docker tag inso us-central1-docker.pkg.dev/gen-lang-client-0159237802/cloud-run-source-deploy/insobackend:latest 

 docker push us-central1-docker.pkg.dev/gen-lang-client-0159237802/cloud-run-source-deploy/insobackend:latest

 ssh -i C:\Users\UseR\.ssh\inso_vm user@34.29.4.131 ./pull_run.sh 