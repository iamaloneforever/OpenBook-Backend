pipeline {
    agent {
        docker {
            image 'docker.arvancloud.ir/node:20'
            args '-u root'
        }
    }

    parameters {
        choice(
            name: 'RETRY_COUNT',
            choices: ['1', '2', '3', '5'],
            description: 'Number of retry attempts for npm ci'
        )
    }

    environment {
        CI = 'true'

        BRANCH_REQUESTED = "${env.CHANGE_BRANCH ?: env.BRANCH_NAME ?: 'unknown'}"
        COMMIT_SHA       = "${env.GIT_COMMIT ?: 'unknown'}"
        PR_NUMBER        = "${env.CHANGE_ID ?: 'none'}"
        PR_TARGET        = "${env.CHANGE_TARGET ?: 'none'}"

        BUILD_ID         = "${env.BUILD_ID}"
        BUILD_NUMBER     = "${env.BUILD_NUMBER}"
        BUILD_URL        = "${env.BUILD_URL}"
        JOB_NAME         = "${env.JOB_NAME}"
        NODE_NAME        = "${env.NODE_NAME}"
        WORKSPACE_DIR    = "${env.WORKSPACE}"
    }

    stages {

        stage('CI Information') {
            steps {
                sh '''
                    echo "========================================"
                    echo "           CI BUILD INFORMATION"
                    echo "========================================"
                    echo "Job:             $JOB_NAME"
                    echo "Build:           #$BUILD_NUMBER"
                    echo "Branch:          $BRANCH_REQUESTED"
                    echo "PR Number:       $PR_NUMBER"
                    echo "PR Target:       $PR_TARGET"
                    echo "Commit:          $COMMIT_SHA"
                    echo "Retry Count:     $RETRY_COUNT"
                    echo "========================================"
                '''
            }
        }

        stage('Network Check') {
            steps {
                sh '''
                    node --version
                    npm --version
                    npm config get registry
                    npm ping
                '''
            }
        }

        stage('Install') {
            steps {
                retry(params.RETRY_COUNT.toInteger()) {
                    sh '''
                        npm config set fetch-retries 5
                        npm config set fetch-retry-mintimeout 20000
                        npm config set fetch-retry-maxtimeout 120000
                        npm ci --loglevel verbose
                    '''
                }
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
                parallel(
                    unit: {
                        sh 'npm run test'
                    },
                    e2e: {
                        sh 'npm run test:e2e'
                    }
                )
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }

    post {
        always {
            echo """
========================================
CI FINISHED
========================================
Job:       ${env.JOB_NAME}
Build:     #${env.BUILD_NUMBER}
Branch:    ${env.BRANCH_REQUESTED}
Commit:    ${env.COMMIT_SHA}
PR:        ${env.PR_NUMBER}
Target:    ${env.PR_TARGET}
Retries:   ${params.RETRY_COUNT}
Status:    ${currentBuild.currentResult}
URL:       ${env.BUILD_URL}
========================================
"""
        }

        success {
            echo '✅ All checks passed — PR can be merged.'
        }

        failure {
            echo '❌ CI failed — PR should not be merged.'
        }

        unstable {
            echo '⚠️ CI finished with warnings.'
        }

        aborted {
            echo '🛑 CI build was aborted.'
        }
    }
}
