const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

const DEV_PORT = 3000;

module.exports = {
    mode: 'development',
    entry: './src/index.js',
    output: {
	path: path.resolve(__dirname, './dist')
    },
    devtool: 'inline-source-map',
    devServer: {
	host: 'localhost',
	port: DEV_PORT,
	open: true
    },
    module: {
	rules: [
	    {
		test: /\.(js|jsx)$/,
		exclude: /node_modules/,
		use: ['babel-loader']
	    },
	    {
		test: /\.css$/,
		use: [
		    {
			loader: 'style-loader'
		    },
		    {
			loader: 'css-loader'
		    }
		]
	    }
	]
    },
    plugins: [
	new HtmlWebpackPlugin({
	    title: 'View reconstruction - Scrapy',
	    template: './src/index.html',
	})
    ],
    resolve: {
	extensions: ['.js', '.jsx']
    }
};
