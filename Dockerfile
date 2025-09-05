FROM ubuntu

# Install dependencies.
RUN apt update && apt install -y nodejs npm golang

# Copy the full repo. This is a bit of a hack, but it's quick to get working!
WORKDIR /code
COPY . .

WORKDIR /code
CMD ["/usr/bin/make", "run"]
