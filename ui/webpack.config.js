const path = require("path")
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: "development",
  entry: "./src/index.js",
  devtool: "inline-source-map",
  output: {
    path: path.resolve(__dirname, "public"),
    filename: "index_bundle.js",
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Cube Tools',
    }),
  ],
  devServer: {
    allowedHosts: [
      "cube-tools-344508482023.us-central1.run.app"
    ],
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:8888',
      },
    ],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
      },
      {
        test: /\.css$/,
        use: [
         { loader: 'style-loader' },
         { loader: 'css-loader' },
        ]
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
    ],
  },
};
