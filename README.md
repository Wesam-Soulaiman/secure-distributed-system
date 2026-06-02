# Secure Distributed System

This project demonstrates a secure distributed system using:

- Nginx Gateway
- Custom Express Load Balancer
- Express Backend Nodes
- Simplified Raft State
- React Dashboard
- Docker Compose

## Current Phase

Initial project structure with running services.

## Architecture

```text
Browser / Client
      |
      v
Nginx Gateway
      |
      v
Custom Load Balancer
      |
      +--> node-a
      +--> node-b
      +--> node-c