# Network Sloth — Subnet Calculator & Network Planner

Network Sloth is a comprehensive, client-side web utility built specifically for network engineers. It takes the heavy lifting out of complex subnetting tasks, provides real-world VLSM scenario planning, and generates ready-to-deploy firewall and DHCP configurations across multiple industry-standard platforms.

## 🚀 Features

* **Dynamic Subnetting Calculator:** Easily calculate subnets by specifying either the **Subnets Required** or **Hosts per Subnet**. Instantly view network addresses, usable host ranges, broadcast addresses, and Cisco wildcard masks.
* **VLSM Scenario Planner:** Pre-built, real-world network templates (Small Corporate, Data Centre, Home Lab, etc.) that auto-allocate optimized subnets using Variable Length Subnet Masking (VLSM). 
* **DHCP Scope Generator:** Automatically generate CLI commands and configuration blocks based on your calculated subnets. Supported platforms include:
    * Cisco IOS
    * Windows Server DHCP (PowerShell)
    * ISC DHCP (`dhcpd.conf`)
    * Kea DHCP4 (JSON)
    * MikroTik RouterOS
* **Firewall Rules Engine:** Define networks and build policies (Strict, Relaxed, or Custom) to output ACLs and filters for Cisco IOS, pfSense/OPNsense XML, and Juniper.
* **CSV Export:** Quickly export your subnetting tables and scenario plans to CSV for documentation and IPAM records.

## 🛠️ Architecture & Tech Stack

The current application is built using vanilla web technologies, specifically separated into distinct files (`index.html`, `subnet-calculator.css`, and `subnet-calculator.js`) to maintain a clean architecture and prevent file bloating. 

Because it operates entirely client-side, you can run it locally without a web server.

### Local Usage
1. Clone the repository.
2. Open `index.html` in your preferred web browser.

## 🗺️ Roadmap

Network Sloth is actively evolving. Upcoming planned updates include:

* **Framework Migration:** Transitioning from static GitHub Pages to a multi-page site structure powered by the **Astro** framework for better scalability and component management.
* **UI/UX Overhaul:** Implementing a refreshed dark theme featuring deep blue color accents.
* **Platform Growth:** Expanding integrated advertising and affiliate link placements for network engineering tools and training.

## 📝 License

All calculations and generated configurations are provided for informational purposes. Always review and test generated CLI commands in a lab environment before deploying to production.
