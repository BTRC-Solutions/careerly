# Jenkins for Careerly's deploys (ARCHITECTURE §19.6, ADR-21): the plugins and the configuration are baked in, so
# a Jenkins recreated from scratch (`docker compose down -v && docker compose up -d --build`) comes up configured,
# with the deploy job, and without the setup wizard.
FROM jenkins/jenkins:2.580.2-lts-jdk21

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY jenkins.yaml /usr/share/jenkins/ref/casc/jenkins.yaml
ENV CASC_JENKINS_CONFIG=/usr/share/jenkins/ref/casc/jenkins.yaml
