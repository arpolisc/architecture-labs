import { AssignCourierAndStartDelivery } from '../application/use-cases/AssignCourierAndStartDelivery';
import { ConfirmOrder } from '../application/use-cases/ConfirmOrder';
import { CreateOrder } from '../application/use-cases/CreateOrder';
import { Courier } from '../domain/entities/Courier';
import { Customer } from '../domain/entities/Customer';
import { Restaurant } from '../domain/entities/Restaurant';
import { InMemoryCourierRepository } from '../infrastructure/repositories/InMemoryCourierRepository';
import { InMemoryCustomerRepository } from '../infrastructure/repositories/InMemoryCustomerRepository';
import { InMemoryDeliveryRepository } from '../infrastructure/repositories/InMemoryDeliveryRepository';
import { InMemoryOrderRepository } from '../infrastructure/repositories/InMemoryOrderRepository';
import { InMemoryRestaurantRepository } from '../infrastructure/repositories/InMemoryRestaurantRepository';

/** Єдина точка складання залежностей (composition root). */
export async function createContainer() {
  const orders = new InMemoryOrderRepository();
  const customers = new InMemoryCustomerRepository();
  const restaurants = new InMemoryRestaurantRepository();
  const couriers = new InMemoryCourierRepository();
  const deliveries = new InMemoryDeliveryRepository();

  // Демонстраційні дані для CLI.
  await customers.save(
    new Customer('cust-1', 'Ірина Коваленко', '+380501112233'),
  );
  await restaurants.save(new Restaurant('rest-1', 'Ресторан Смачно'));
  await couriers.save(new Courier('courier-1', 'Олена Кур’єр'));

  return {
    createOrder: new CreateOrder(orders, customers, restaurants),
    confirmOrder: new ConfirmOrder(orders),
    assignCourierAndStartDelivery: new AssignCourierAndStartDelivery(
      orders,
      couriers,
      deliveries,
    ),
  };
}

export type Container = Awaited<ReturnType<typeof createContainer>>;
