/**
 * Skills dictionary used by the deterministic step of job matching.
 *
 * Each skill has a canonical `name` and lower-case `aliases` (the name itself is matched too, except for ambiguous() entries).
 * Matching is case-insensitive on whole words, and the longest alias wins ("react native" beats "react").
 *
 * Deliberately NOT matched on their own because they are ordinary words or company names:
 * go, r, c, express, spring, swift, excel, spark, oracle, rest.
 * Use the unambiguous forms instead ("golang", "express.js", "spring boot", "ms excel") via ambiguous().
 *
 * To add a skill: add one line. Keep aliases lower-case.
 */
const skill = (name, ...aliases) => ({ name, aliases: [name.toLowerCase(), ...aliases] });
/** Like skill(), but the bare name is NOT matched on its own because it is also an everyday word or company name. */
const ambiguous = (name, ...aliases) => ({ name, aliases });

export const SKILLS = [
  // Languages
  skill("JavaScript", "js", "ecmascript", "es6"),
  skill("TypeScript", "ts"),
  skill("Python"),
  skill("Java"),
  skill("C#", "csharp"),
  skill("C++", "cpp"),
  skill("Golang"),
  skill("PHP"),
  skill("Ruby", "ruby on rails", "rails"),
  skill("Kotlin"),
  ambiguous("Swift", "swiftui", "swift programming"),
  skill("Rust", "rustlang"),
  skill("Scala"),
  skill("SQL"),
  skill("Bash", "shell scripting"),

  // Frontend
  skill("React", "reactjs", "react.js"),
  skill("React Native"),
  skill("Next.js", "nextjs", "next js"),
  skill("Angular", "angularjs"),
  skill("Vue", "vue.js", "vuejs"),
  skill("Redux"),
  skill("HTML", "html5"),
  skill("CSS", "css3"),
  skill("Tailwind CSS", "tailwind", "tailwindcss"),
  skill("Sass", "scss"),
  skill("Webpack"),
  skill("Vite"),
  skill("jQuery"),
  skill("Flutter"),

  // Backend
  skill("Node.js", "nodejs", "node js", "node"),
  skill("Express.js", "expressjs", "express js"),
  skill("NestJS", "nest.js"),
  skill("Django"),
  skill("Flask"),
  skill("FastAPI"),
  skill("Spring Boot", "springboot", "spring framework"),
  skill(".NET", "dotnet", "asp.net", "asp.net core", ".net core"),
  skill("Laravel"),
  skill("REST APIs", "rest api", "restful", "restful apis"),
  skill("GraphQL"),
  skill("gRPC"),
  skill("Microservices", "microservice"),
  skill("WebSockets", "websocket", "socket.io"),

  // Databases
  skill("PostgreSQL", "postgres", "psql"),
  skill("MySQL"),
  skill("MongoDB", "mongo"),
  skill("Redis"),
  skill("SQLite"),
  skill("Elasticsearch"),
  skill("DynamoDB"),
  skill("NoSQL"),
  ambiguous("Oracle DB", "oracle db", "oracle database", "pl/sql"),
  skill("SQL Server", "mssql", "ms sql", "t-sql"),
  skill("Prisma"),
  skill("Sequelize"),

  // Cloud, DevOps
  skill("AWS", "amazon web services", "ec2", "s3", "lambda"),
  skill("Azure"),
  skill("Google Cloud", "gcp"),
  skill("Docker"),
  skill("Kubernetes", "k8s"),
  skill("Terraform"),
  skill("CI/CD", "ci cd", "jenkins", "github actions", "gitlab ci"),
  skill("Linux"),
  skill("Nginx"),
  skill("Heroku"),
  skill("Git", "github", "gitlab", "bitbucket"),
  skill("Kafka", "apache kafka"),
  skill("RabbitMQ"),

  // Data / ML
  skill("Machine Learning", "ml"),
  skill("Deep Learning"),
  skill("TensorFlow"),
  skill("PyTorch"),
  skill("Pandas"),
  skill("NumPy"),
  skill("Data Analysis", "data analytics"),
  skill("Power BI", "powerbi"),
  skill("Tableau"),
  ambiguous("Excel", "ms excel", "microsoft excel", "advanced excel"),
  ambiguous("Spark", "apache spark", "pyspark"),
  skill("Airflow", "apache airflow"),
  skill("ETL"),
  skill("NLP", "natural language processing"),
  skill("LLM", "llms", "large language models", "generative ai", "genai"),

  // Mobile
  skill("Android"),
  skill("iOS"),

  // Testing / quality
  skill("Jest"),
  skill("Cypress"),
  skill("Selenium"),
  skill("Playwright"),
  skill("Unit Testing", "unit tests", "tdd"),
  skill("Postman"),

  // Platforms / CMS
  skill("Shopify"),
  skill("WordPress"),
  skill("Salesforce"),
  skill("SAP"),

  // Practices
  skill("Agile", "scrum"),
  skill("Jira"),
  skill("System Design"),
  skill("OOP", "object oriented", "object-oriented"),
  skill("Data Structures", "algorithms", "dsa"),
];
