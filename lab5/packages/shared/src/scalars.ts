import { GraphQLError, GraphQLScalarType, Kind } from "graphql";

export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "ISO-8601 timestamp in UTC",
  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" || typeof value === "number") return new Date(value).toISOString();
    throw new GraphQLError("DateTime cannot represent value");
  },
  parseValue(value) {
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) throw new GraphQLError("Invalid DateTime");
    return date;
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new GraphQLError("DateTime must be a string");
    const date = new Date(ast.value);
    if (Number.isNaN(date.getTime())) throw new GraphQLError("Invalid DateTime");
    return date;
  },
});

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (value) => value,
  parseValue: (value) => value,
});

export const SCALARS_SDL = `
scalar DateTime
scalar JSON
`;
