##### Which URL should I use?

ChirpStack sends the device data to the ThingsBoard HTTP API. Enter the URL the ChirpStack server can reach ThingsBoard at, with `http://` or `https://` and the port when it isn't the default one:

* **ChirpStack on the same machine, in Docker:** the machine's IP in its network, e.g. `http://192.168.1.10:8080`. Inside a container, `localhost` means the container itself.
* **ChirpStack in the same local network:** the IP of the ThingsBoard server in that network, e.g. `http://192.168.1.10:8080`. Allow the port in its firewall.
* **ChirpStack in the cloud:** ThingsBoard must be reachable from the internet. Use its public domain or IP, e.g. `https://tb.mycompany.com`.
* **ThingsBoard behind a reverse proxy** (nginx, a load balancer): the URL the proxy serves, usually the one you open ThingsBoard at, e.g. `https://tb.mycompany.com`, not the internal port `8080`.

`localhost` or `127.0.0.1` works only when ChirpStack runs on the same machine outside Docker.
