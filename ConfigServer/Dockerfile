FROM amazoncorretto:17
EXPOSE 8883
ADD ./target/ConfigServer-0.0.1-SNAPSHOT.jar ConfigServer.jar
ENTRYPOINT ["java", "-jar", "ConfigServer.jar"]