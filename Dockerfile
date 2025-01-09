FROM ubuntu

# Install dependencies.
RUN apt update && apt install -y nodejs npm

# Copy the full repo. This is a bit of a hack, but it's quick to get working!
WORKDIR /code
COPY . .

WORKDIR /code/ui
CMD ["/usr/bin/npm", "start"]
