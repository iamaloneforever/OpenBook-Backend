pipeline {
    agent {
        docker {
            image 'docker.arvancloud.ir/node:20'
        }
    }

    environment {
        CI = 'true'
    }

    stages {

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }

        stage('Type Check') {
            steps {
                sh 'npm run typecheck'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }

    post {
        success {
            echo '✅ All checks passed — PR can be merged.'
        }

        failure {
            echo '❌ CI failed — PR should not be merged.'
        }
    }
}
