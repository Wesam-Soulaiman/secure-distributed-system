# Secure Distributed System

A practical distributed systems project that combines:

- Nginx Gateway
- WAF Rules
- Rate Limiting
- Custom Express Load Balancer
- Weighted Round Robin
- Health Checks
- Consistent Hashing
- Key-Value Store
- Raft Leader-aware Routing
- Raft Log Replication
- Majority Commit
- Simplified Leader Election
- React Dashboard

---

## 1. Project Idea

This project implements a secure distributed key-value system.

The client does not communicate directly with backend nodes.  
All traffic goes through an Nginx Gateway, then a custom Express Load Balancer, then a cluster of three Raft nodes.

```text
Browser / Client
      |
      v
Nginx Gateway
  - WAF
  - Rate Limiting
  - Reverse Proxy
      |
      v
Custom Load Balancer
  - Weighted Round Robin
  - Health Checks
  - Consistent Hashing
  - Leader-aware Routing
      |
      v
Raft Nodes
  - node-a
  - node-b
  - node-c