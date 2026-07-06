export const config = () => ({
    port: 3000,
    jwtSecret:  process.env.JWT_SECRET || 'your_jwt_secret',
});
