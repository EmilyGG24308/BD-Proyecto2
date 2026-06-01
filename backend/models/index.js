require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host:    process.env.DB_HOST,
    dialect: 'mysql',
    logging: false,
  }
);

const Producto = sequelize.define('producto', {
  id:              { type: DataTypes.INTEGER,       primaryKey: true, autoIncrement: true },
  categoria_id:    { type: DataTypes.INTEGER,       allowNull: false },
  proveedor_id:    { type: DataTypes.INTEGER,       allowNull: false },
  nombre:          { type: DataTypes.STRING(150),   allowNull: false },
  precio_unitario: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  stock:           { type: DataTypes.INTEGER,       defaultValue: 0 },
  descripcion:     { type: DataTypes.TEXT },
}, { timestamps: false });

const Cliente = sequelize.define('cliente', {
  id:       { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
  nombre:   { type: DataTypes.STRING(100), allowNull: false },
  apellido: { type: DataTypes.STRING(100), allowNull: false },
  email:    { type: DataTypes.STRING(150), allowNull: false },
  telefono: { type: DataTypes.STRING(20),  allowNull: false },
}, { timestamps: false });

const AppUser = sequelize.define('app_user', {
  id:            { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
  username:      { type: DataTypes.STRING(60),  allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  role:          { type: DataTypes.ENUM('admin','gerente','vendedor','cajero','bodeguero'), allowNull: false },
  activo:        { type: DataTypes.TINYINT,     defaultValue: 1 },
}, { timestamps: false, tableName: 'app_user' });

module.exports = { sequelize, Producto, Cliente, AppUser };