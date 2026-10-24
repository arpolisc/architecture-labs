import { Order, OrderStatus } from '../../domain/entities/Order';

/** DTO відповіді: шар подання не отримує доменних сутностей. */
export interface OrderDto {
  id: string;
  customerId: string;
  restaurantId: string;
  deliveryAddress: string;
  items: string[];
  status: OrderStatus;
  courierId: string | null;
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    customerId: order.customerId,
    restaurantId: order.restaurantId,
    deliveryAddress: order.deliveryAddress,
    items: [...order.items],
    status: order.status,
    courierId: order.courierId,
  };
}
