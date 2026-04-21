const { pool } = require('../config/db');

// @desc    Create new order
// @route   POST /api/orders
const createOrder = async (req, res) => {
    try {
        const {
            user_id,
            email,
            orderItems,
            shippingAddress,
            paymentMethod,
            totalPrice
        } = req.body;

        if (orderItems && orderItems.length === 0) {
            return res.status(400).json({ message: 'No order items' });
        }

        const parsedUserId = parseInt(user_id, 10);
        const finalUserId = isNaN(parsedUserId) ? null : parsedUserId;

        const result = await pool.query(
            'INSERT INTO orders (user_id, email, shipping_address, payment_method, total_price) VALUES ($1, $2, $3, $4, $5) RETURNING *, total_price AS "totalPrice", created_at AS "createdAt", shipping_address AS "shippingAddress", payment_method AS "paymentMethod"',
            [finalUserId, email || null, JSON.stringify(shippingAddress), paymentMethod, totalPrice]
        );
        
        const order = result.rows[0];
        
        // Insert order items
        for (const item of orderItems) {
            const parsedProductId = parseInt(item.product_id, 10);
            const finalProductId = isNaN(parsedProductId) ? null : parsedProductId;

            await pool.query(
                'INSERT INTO order_items (order_id, product_id, name, qty, image, price) VALUES ($1, $2, $3, $4, $5, $6)',
                [order.id, finalProductId, item.name, item.qty, item.image, item.price]
            );
        }

        res.status(201).json({
            success: true,
            data: order
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
const getOrders = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, 
                   o.total_price AS "totalPrice", 
                   o.created_at AS "createdAt", 
                   o.shipping_address AS "shippingAddress",
                   o.payment_method AS "paymentMethod",
                   u.name as user_name, u.email as user_email 
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            ORDER BY o.created_at DESC
        `);

        // Fetch items for each order
        const orders = [];
        for (const order of result.rows) {
            const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
            
            // Parse shipping address if it's a string
            let shippingAddress = order.shippingAddress;
            if (typeof shippingAddress === 'string') {
                try { shippingAddress = JSON.parse(shippingAddress); } catch (e) {}
            }

            orders.push({
                ...order,
                shippingAddress,
                user: { name: order.user_name, email: order.user_email },
                orderItems: itemsResult.rows
            });
        }

        res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
const getOrderById = async (req, res) => {
    try {
        const parsedOrderId = parseInt(req.params.id, 10);
        if (isNaN(parsedOrderId)) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const result = await pool.query(`
            SELECT o.*, 
                   o.total_price AS "totalPrice", 
                   o.created_at AS "createdAt", 
                   o.shipping_address AS "shippingAddress",
                   o.payment_method AS "paymentMethod",
                   o.delivered_at AS "deliveredAt",
                   u.name as user_name, u.email as user_email
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = $1
        `, [parsedOrderId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const order = result.rows[0];
        const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

        // Parse shipping address if it's a string
        let shippingAddress = order.shippingAddress;
        if (typeof shippingAddress === 'string') {
            try { shippingAddress = JSON.parse(shippingAddress); } catch (e) {}
        }

        res.status(200).json({
            success: true,
            data: {
                ...order,
                shippingAddress,
                user: { name: order.user_name, email: order.user_email },
                orderItems: itemsResult.rows
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const parsedOrderId = parseInt(req.params.id, 10);
        if (isNaN(parsedOrderId)) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const deliveredAt = status === 'Delivered' ? new Date() : null;
        const isPaid = status === 'Delivered' ? true : undefined; // Don't change is_paid unless delivered

        let query, values;
        if (status === 'Delivered') {
            query = 'UPDATE orders SET status = $1, delivered_at = $2, is_paid = $3 WHERE id = $4 RETURNING *';
            values = [status, deliveredAt, isPaid, parsedOrderId];
        } else {
            query = 'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *';
            values = [status, parsedOrderId];
        }

        const result = await pool.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders/:userId
const getMyOrders = async (req, res) => {
    try {
        const parsedUserId = parseInt(req.params.userId, 10);
        if (isNaN(parsedUserId)) {
            // If the userId is an old MongoDB string, they won't have any PostgreSQL orders anyway
            return res.status(200).json({ success: true, data: [] });
        }

        const result = await pool.query(`
            SELECT *, 
                   total_price AS "totalPrice", 
                   created_at AS "createdAt", 
                   shipping_address AS "shippingAddress",
                   payment_method AS "paymentMethod"
            FROM orders 
            WHERE user_id = $1 
            ORDER BY created_at DESC
        `, [parsedUserId]);
        
        const orders = [];
        for (const order of result.rows) {
            const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
            
            // Parse shipping address if it's a string
            let shippingAddress = order.shippingAddress;
            if (typeof shippingAddress === 'string') {
                try { shippingAddress = JSON.parse(shippingAddress); } catch (e) {}
            }

            orders.push({
                ...order,
                shippingAddress,
                orderItems: itemsResult.rows
            });
        }

        res.status(200).json({
            success: true,
            data: orders
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Delete order (Admin)
// @route   DELETE /api/orders/:id
const deleteOrder = async (req, res) => {
    try {
        // First delete items
        await pool.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
        // Then delete order
        const result = await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Order deleted successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrderStatus,
    getMyOrders,
    deleteOrder
};
