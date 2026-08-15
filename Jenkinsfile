pipeline {
    agent {
        docker {
            image 'docker.arvancloud.ir/node:20'
            args '-u root'
        }
    }

    environment {
        CI = 'true'

        // Jenkins metadata
        BRANCH_REQUESTED = "${env.CHANGE_BRANCH ?: env.BRANCH_NAME ?: 'unknown'}"
        COMMIT_SHA       = "${env.GIT_COMMIT ?: 'unknown'}"
        PR_NUMBER        = "${env.CHANGE_ID ?: 'none'}"
        PR_TARGET        = "${env.CHANGE_TARGET ?: 'none'}"

        // Build metadata
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
                    echo "Build URL:       $BUILD_URL"
                    echo "Branch:          $BRANCH_REQUESTED"
                    echo "PR Number:       $PR_NUMBER"
                    echo "PR Target:       $PR_TARGET"
                    echo "Commit:          $COMMIT_SHA"
                    echo "Node:            $NODE_NAME"
                    echo "Workspace:       $WORKSPACE_DIR"
                    echo "========================================"
                '''
            }
        }

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
