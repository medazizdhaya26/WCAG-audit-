FROM amazoncorretto:17
EXPOSE 8761
ADD ./target/DiscoveryServer-0.0.1-SNAPSHOT.jar DiscoveryServer.jar
ENTRYPOINT ["java", "-jar", "DiscoveryServer.jar"]